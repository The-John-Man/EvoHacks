/*
 * Claimable — "how long until help arrives" for each program.
 *
 * Every estimate is labeled by how solid it is:
 *   law       – a federal deadline the agency must meet (it can still run late)
 *   calendar  – fixed by dates (tax season, open enrollment, summer)
 *   average   – a published national average
 *   typical   – common practice; varies a lot by state or provider
 *
 * Estimates are personalized from the household answers where the rules allow
 * (expedited SNAP, WIC priority, LIHEAP crisis, disability-based Medicaid, etc.)
 * and from today's date for calendar-based programs.
 */
(function (root) {
  "use strict";

  const Rules = root.Claimable || (typeof require !== "undefined" ? require("./rules.js") : null);
  const DAY = 24 * 3600 * 1000;

  // ---------- Date helpers ----------
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysUntil = (today, date) => Math.max(0, Math.round((startOfDay(date) - startOfDay(today)) / DAY));
  const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const fmtMonth = (d) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  /** Bucket by the upper end of the typical wait. */
  function bucketOf(maxDays) {
    if (maxDays <= 7) return "week";
    if (maxDays <= 31) return "month";
    if (maxDays <= 92) return "quarter";
    return "longer";
  }

  const BUCKETS = {
    week: "Within a week",
    month: "Within a month",
    quarter: "1–3 months",
    longer: "More than 3 months",
  };

  // ---------- Calendar logic (pure, testable) ----------

  /** Tax refunds with EITC/ACTC: held by law until mid-February; most arrive by early March. */
  function taxRefundWindow(today) {
    const y = today.getFullYear();
    const m = today.getMonth(); // 0 = Jan
    // From late spring through December, the next chance is next year's filing season.
    if (m >= 4) {
      const early = new Date(y + 1, 2, 1); // ~March 1
      const late = new Date(y + 1, 2, 15);
      return { early, late, label: `Early March ${y + 1}`, note: `File as soon as the ${y + 1} tax season opens (late January) and choose direct deposit. By law (the PATH Act), refunds that include these credits are held until mid-February. Most arrive by early March.` };
    }
    const holdEnds = new Date(y, 1, 15);
    if (today < holdEnds) {
      return { early: new Date(y, 2, 1), late: new Date(y, 2, 15), label: `Early March ${y}`, note: "Refunds with these credits are held by law until mid-February. With e-file and direct deposit, most arrive by early March." };
    }
    return { early: new Date(today.getTime() + 21 * DAY), late: new Date(today.getTime() + 42 * DAY), label: "About 3–6 weeks after you file", note: "The IRS issues most e-filed refunds within 21 days. Paper returns take longer." };
  }

  /** HealthCare.gov open enrollment: Nov 1 – Jan 15 (enroll by Dec 15 for Jan 1). */
  function marketplaceStart(today) {
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    if (m === 10 || (m === 11 && d <= 15)) {
      return { start: new Date(y + 1, 0, 1), inOpenEnrollment: true, note: `Open enrollment is on now. Pick a plan by December 15 for coverage starting January 1, ${y + 1}.` };
    }
    if (m === 11 || (m === 0 && d <= 15)) {
      const startYear = m === 11 ? y + 1 : y;
      return { start: new Date(startYear, 1, 1), inOpenEnrollment: true, note: "Open enrollment ends January 15. Plans picked now start February 1." };
    }
    const nextMonth = new Date(y, m + 1, 1);
    return { start: nextMonth, inOpenEnrollment: false, note: "Outside open enrollment (Nov 1 – Jan 15) you need a qualifying life event, such as losing other coverage, moving, or having a baby. Coverage usually starts the first of the next month." };
  }

  /** SUN Bucks are issued in summer. */
  function nextSummer(today) {
    const y = today.getFullYear();
    const june = new Date(y, 5, 1);
    const sept = new Date(y, 8, 1);
    if (today < june) return { start: june, end: new Date(y, 7, 31) };
    if (today < sept) return { start: today, end: new Date(y, 7, 31) };
    return { start: new Date(y + 1, 5, 1), end: new Date(y + 1, 7, 31) };
  }

  // ---------- Per-program estimates ----------

  const S = {
    snapRule: { label: "7 CFR 273.2 (30-day and 7-day expedited rules)", url: "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-C/part-273/section-273.2" },
    wicRule: { label: "7 CFR 246.7 (WIC processing standards)", url: "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-A/part-246/subpart-C" },
    schoolRule: { label: "7 CFR 245.6 (10 operating days)", url: "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-A/part-245/section-245.6" },
    medicaidRule: { label: "42 CFR 435.912 (45/90-day standard)", url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-435/subpart-J/section-435.912" },
    retro: { label: "Justice in Aging: H.R. 1 retroactive coverage change", url: "https://justiceinaging.org/hr1-reduces-medicaid-retroactive-eligibility-starting-in-2027/" },
    irsEitc: { label: "IRS: refund timing for EITC/ACTC", url: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/when-to-expect-your-refund-if-you-claimed-the-eitc-or-actc" },
    healthcare: { label: "HealthCare.gov: dates and deadlines", url: "https://www.healthcare.gov/quick-guide/dates-and-deadlines/" },
    liheap: { label: "ACF: LIHEAP crisis 48-/18-hour rule", url: "https://acf.gov/ocs/faq/liheap-q-disaster-relief" },
    irs501r: { label: "IRS: hospital billing and collections (501(r))", url: "https://www.irs.gov/charities-non-profits/billing-and-collections-section-501r6" },
    ssa: { label: "SSA: disability processing time", url: "https://www.ssa.gov/ssa-performance/disability-processing-time" },
    vouchers: { label: "CBPP: families wait years for vouchers", url: "https://www.cbpp.org/research/housing/families-wait-years-for-housing-vouchers-due-to-inadequate-funding" },
    lifeline: { label: "USAC National Verifier", url: "https://www.usac.org/lifeline/eligibility/" },
    sunBucks: { label: "USDA SUN Bucks", url: "https://www.fns.usda.gov/summer/sunbucks" },
    fafsa: { label: "StudentAid.gov: when you'll get your aid", url: "https://studentaid.gov/h/apply-for-aid/fafsa" },
  };

  const ESTIMATORS = {
    snap(ctx) {
      const shelter = (ctx.h.rentMonthly || 0) + (ctx.h.utilitiesMonthly || 0);
      const expedited = ctx.grossMonthly < 150 || shelter > ctx.grossMonthly;
      const base = {
        basis: "law",
        source: S.snapRule,
        speedUp: [
          "Apply today, even if you're missing papers. Your first month is counted from the day you apply.",
          "Answer the interview call. Missing it is the most common cause of delays.",
        ],
      };
      if (expedited) {
        return { ...base, minDays: 1, maxDays: 7, label: "Within 7 days (expedited)",
          details: [
            ctx.grossMonthly < 150
              ? "Your income is under $150 a month. If you also have $100 or less in cash and bank accounts, the law requires a decision within 7 days."
              : "Your rent and utilities are more than your income. If that's still true after counting your cash and bank balance, you qualify for 7-day expedited service.",
            "Say \"I need expedited SNAP\" when you apply.",
          ] };
      }
      return { ...base, minDays: 10, maxDays: 30, label: "Within 30 days",
        details: ["The law requires a decision within 30 days of your application. Benefits arrive on an EBT card."] };
    },

    wic(ctx) {
      const priority = ctx.h.pregnant || ctx.kidsUnder1 > 0;
      return {
        basis: "law", source: S.wicRule,
        minDays: 1, maxDays: priority ? 10 : 20,
        label: priority ? "Within 10 days" : "Within 20 days",
        details: [
          priority
            ? "Pregnant people and babies get priority: the clinic must decide within 10 days of when you ask."
            : "The clinic must decide within 20 days of when you ask.",
          "Food benefits are usually loaded onto your WIC card at your first appointment.",
        ],
        speedUp: ["Call the clinic and ask for the first open appointment. Bring proof of SNAP or Medicaid to skip the income check."],
      };
    },

    "school-meals"(ctx) {
      const direct = ctx.onSnap || ctx.onTanf;
      return {
        basis: "law", source: S.schoolRule,
        minDays: direct ? 0 : 3, maxDays: 14,
        label: direct ? "Often right away" : "Within 10 school days",
        details: direct
          ? ["Kids in SNAP or TANF households are usually certified automatically (\"direct certification\"). Ask the school office to confirm."]
          : ["Schools must decide within 10 operating days of getting a complete application."],
        speedUp: ["Turn in one application for all your kids, at any time during the school year."],
      };
    },

    "sun-bucks"(ctx, today) {
      const s = nextSummer(today);
      return {
        basis: "calendar", source: S.sunBucks,
        minDays: daysUntil(today, s.start), maxDays: daysUntil(today, s.end),
        label: `Summer ${s.start.getFullYear()}`,
        details: [`SUN Bucks are paid once, during summer break (expected ${fmtMonth(s.start)} – ${fmtMonth(s.end)}). Exact timing depends on your state.`],
        speedUp: ["If your kids get free meals or you get SNAP, it's usually automatic. Watch for a card in the mail."],
      };
    },

    eitc(ctx, today) {
      const w = taxRefundWindow(today);
      return {
        basis: "calendar", source: S.irsEitc,
        minDays: daysUntil(today, w.early), maxDays: daysUntil(today, w.late),
        label: w.label,
        details: [w.note],
        speedUp: [
          "Use free tax help (VITA) and choose direct deposit. It's the fastest way.",
          "Missed it in past years? You can still claim credits from the last 3 years by filing those returns.",
        ],
      };
    },

    ctc(ctx, today) {
      const w = taxRefundWindow(today);
      return {
        basis: "calendar", source: S.irsEitc,
        minDays: daysUntil(today, w.early), maxDays: daysUntil(today, w.late),
        label: w.label,
        details: [w.note],
        speedUp: ["File with direct deposit. Make sure each child has a Social Security number before you file."],
      };
    },

    "medicaid-adult"(ctx, today) { return medicaid(ctx, today, "adult"); },
    "medicaid-kids"(ctx, today) { return medicaid(ctx, today, "kids"); },

    marketplace(ctx, today) {
      const m = marketplaceStart(today);
      return {
        basis: "calendar", source: S.healthcare,
        minDays: daysUntil(today, m.start), maxDays: daysUntil(today, m.start),
        label: `Coverage from ${fmtDate(m.start)}`,
        details: [m.note, "Some states run their own marketplace with different dates."],
        speedUp: m.inOpenEnrollment ? ["Pick a plan by December 15 to be covered on January 1."] : [],
      };
    },

    "charity-care"() {
      return {
        basis: "typical", source: S.irs501r,
        minDays: 14, maxDays: 60,
        label: "Usually 2–8 weeks",
        details: [
          "Each hospital sets its own review time. Many decide within about 30 days of a complete application.",
          "Deadline: nonprofit hospitals must accept applications for at least 240 days after your first bill.",
        ],
        speedUp: ["While your application is under review, the hospital must hold off on extraordinary collection actions like credit reporting or lawsuits. Tell billing you've applied."],
        deadline: "Apply within 240 days of your first bill",
      };
    },

    liheap(ctx) {
      if (ctx.h.behindUtilities) {
        return {
          basis: "law", source: S.liheap,
          minDays: 1, maxDays: 2,
          label: "Within 48 hours (crisis)",
          details: [
            "With a shutoff notice or no heat, ask for crisis assistance. Federal law requires help within 48 hours, or 18 hours if it's life-threatening.",
            "Regular (non-crisis) energy help takes longer and varies by state.",
          ],
          speedUp: ["Say it's an emergency and have your shutoff notice ready. Also ask your utility about winter shutoff protections."],
        };
      }
      return {
        basis: "typical", source: S.liheap,
        minDays: 14, maxDays: 60,
        label: "Usually 2–8 weeks",
        details: ["Payments usually go straight to your utility company. Most states open heating help in the fall, and funds can run out, so apply early."],
        speedUp: ["Apply as soon as your state's program opens; it's first come, first served in many places."],
      };
    },

    weatherization() {
      return {
        basis: "typical", source: { label: "DOE Weatherization", url: "https://www.energy.gov/scep/wap/weatherization-assistance-program" },
        minDays: 60, maxDays: 365,
        label: "Often several months",
        details: ["Local agencies keep waitlists. Homes with elderly or disabled residents or young children often get priority."],
        speedUp: ["Get on the list now; it costs nothing to wait in line."],
      };
    },

    lifeline(ctx) {
      const auto = ctx.onSnap || ctx.onMedicaid || ctx.onSsi;
      return {
        basis: "typical", source: S.lifeline,
        minDays: 0, maxDays: auto ? 7 : 21,
        label: auto ? "Often the same day" : "A few days to a few weeks",
        details: [
          auto
            ? "If your SNAP, Medicaid, or SSI shows up in the government's automatic check, approval is often instant."
            : "If you qualify by income, you'll upload proof (like a tax return or pay stubs) for a manual review.",
          "After approval, pick a phone or internet company that offers Lifeline to start the discount.",
        ],
        speedUp: ["Apply online at the National Verifier and have a photo of your benefits letter ready."],
      };
    },

    "head-start"() {
      return {
        basis: "typical", source: { label: "Head Start", url: "https://headstart.gov/center-locator" },
        minDays: 7, maxDays: 120,
        label: "Weeks to months, depending on openings",
        details: ["Programs enroll all year when seats open. Many keep waitlists that rank families by need."],
        speedUp: ["Apply to more than one center near you."],
      };
    },

    childcare() {
      return {
        basis: "typical", source: { label: "Childcare.gov", url: "https://childcare.gov/consumer-education/get-help-paying-for-child-care" },
        minDays: 14, maxDays: 180,
        label: "Weeks to months; many states have waitlists",
        details: ["Some states approve within a few weeks; others have waitlists. Priority often goes to families on TANF or with very low incomes."],
        speedUp: ["Ask if your state gives priority to your situation, such as TANF, a child with a disability, or homelessness."],
      };
    },

    pell(ctx, today) {
      return {
        basis: "typical", source: S.fafsa,
        minDays: 14, maxDays: 120,
        label: "At the start of your next term",
        details: ["The FAFSA is processed within days. The grant is paid through your school, usually at the start of each term."],
        speedUp: [`File the FAFSA now. The ${today.getFullYear() + 1}–${String(today.getFullYear() + 2).slice(2)} form is already open, and some state and school aid is first come, first served.`],
      };
    },

    tanf() {
      return {
        basis: "typical", source: { label: "HHS TANF", url: "https://www.acf.hhs.gov/ofa/programs/tanf" },
        minDays: 14, maxDays: 45,
        label: "Usually within 30–45 days",
        details: ["Each state sets its own timeline. Many decide within about 30 days of a complete application."],
        speedUp: ["Ask whether your state offers emergency or diversion payments for an urgent need."],
      };
    },

    ssi(ctx) {
      const disabilityBased = ctx.hasDisabled && !ctx.hasSenior;
      if (disabilityBased) {
        return {
          basis: "average", source: S.ssa,
          minDays: 90, maxDays: 240,
          label: "About 6 months on average",
          details: [
            "Disability decisions averaged about 191 days in 2026 (Social Security).",
            "If approved, back pay usually covers the months since you applied.",
          ],
          speedUp: ["Apply right away, since back pay starts from your application date. Send medical records early."],
        };
      }
      return {
        basis: "typical", source: S.ssa,
        minDays: 30, maxDays: 90,
        label: "Usually 1–3 months",
        details: ["Age-based SSI (65+) doesn't need a medical decision, so it's usually faster than disability claims."],
        speedUp: ["Call Social Security to set a filing date now; it protects your back pay."],
      };
    },

    housing() {
      return {
        basis: "average", source: S.vouchers,
        minDays: 270, maxDays: 900,
        label: "Often years; about 2.5 on average",
        details: ["Families who got vouchers waited about 28 months on average, from 9 months to 5+ years depending on where they live. Many lists are closed."],
        speedUp: ["Get on every open list near you (housing authorities and project-based housing). Call 211 for emergency housing now."],
      };
    },

    unclaimed() {
      return {
        basis: "typical", source: { label: "NAUPA (unclaimed.org)", url: "https://unclaimed.org/" },
        minDays: 30, maxDays: 90,
        label: "Usually 1–3 months",
        details: ["The search is instant. Paying out a claim usually takes weeks once your proof is approved."],
        speedUp: ["Search every state you've lived in."],
      };
    },
  };

  function medicaid(ctx, today, who) {
    const disability = who === "adult" && ctx.hasDisabled;
    const details = [
      disability
        ? "Disability-based applications can take up to 90 days by law."
        : "The law requires a decision within 45 days (states sometimes run late).",
    ];
    const speedUp = [];
    if (who === "adult" && ctx.h.pregnant) {
      details.push("Pregnant? Many clinics can enroll you in temporary coverage the same day (\"presumptive eligibility\").");
    }
    const jan2027 = new Date(2027, 0, 1);
    if (today < jan2027) {
      speedUp.push(`Have recent medical bills? Apply before ${fmtDate(jan2027)}. Coverage can be backdated up to 3 months now, but only 1–2 months starting January 1, 2027 (H.R. 1).`);
    } else {
      speedUp.push("Coverage can be backdated 1–2 months before you apply, so ask about it if you have recent medical bills.");
    }
    return {
      basis: "law",
      source: today < jan2027 ? S.retro : S.medicaidRule,
      minDays: 7, maxDays: disability ? 90 : 45,
      label: disability ? "Up to 90 days" : "Up to 45 days",
      details, speedUp,
    };
  }

  /**
   * Attach a timing estimate to each likely/maybe result.
   * results: from Claimable.screen(). household: the same answers. today: a Date.
   */
  function addTiming(results, household, today = new Date()) {
    const ctx = Rules.buildContext(household);
    return results.map((r) => {
      if (r.status !== "likely" && r.status !== "maybe") return { ...r, timing: null };
      const est = ESTIMATORS[r.id] ? ESTIMATORS[r.id](ctx, today) : null;
      if (!est) return { ...r, timing: null };
      return { ...r, timing: { deadline: null, speedUp: [], ...est, bucket: bucketOf(est.maxDays) } };
    });
  }

  const BASIS_LABEL = {
    law: "Set by federal law",
    calendar: "Set by the calendar",
    average: "National average",
    typical: "Typical; varies by state",
    unknown: "Processing time not researched yet",
  };

  // ======================================================================
  // Per-program application timelines
  // ======================================================================
  //
  // Each plan turns an application date A into dated steps:
  //   you     – something you need to do or send
  //   agency  – something the office does (interview, review, decision)
  //   aid     – when the help itself arrives
  //   renewal – when you'll need to renew or report again
  // If you haven't applied yet, A = today and every date is "if you apply today".

  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }

  /** A step whose window is A+from .. A+to days. */
  const rel = (A, key, kind, title, detail, from, to = from) => ({ key, kind, title, detail, from: addDays(A, from), to: addDays(A, to) });
  /** A step on fixed calendar dates. */
  const abs = (key, kind, title, detail, from, to = from) => ({ key, kind, title, detail, from, to });

  const applyStep = (A, title, detail) => rel(A, "apply", "you", title || "Apply", detail || "Your application date. Keep a copy or screenshot of what you sent.", 0);

  /** Refund timing for a return filed on `filed` that claims EITC/ACTC. */
  function refundAfterFiling(filed) {
    const holdEnds = new Date(filed.getFullYear(), 1, 15);
    if (filed.getMonth() <= 1 && filed < holdEnds) {
      return { from: new Date(filed.getFullYear(), 2, 1), to: new Date(filed.getFullYear(), 2, 15) };
    }
    return { from: addDays(filed, 21), to: addDays(filed, 42) };
  }

  /** Next tax-season opening (about January 26) on or after `today`. */
  function seasonOpens(today) {
    const y = today.getMonth() >= 4 ? today.getFullYear() + 1 : today.getFullYear();
    return new Date(y, 0, 26);
  }

  function taxPlan(ctx, A, today, applied, label) {
    const steps = [];
    if (!applied) {
      const opens = seasonOpens(today);
      const prep = today < opens;
      steps.push(abs("gather", "you", "Gather your tax papers",
        "W-2s and 1099s (sent by January 31), Social Security cards for everyone on the return, and last year's return if you have it.",
        prep ? today : today, prep ? addDays(opens, -1) : today));
      steps.push(abs("file", "you", `File your return to claim the ${label}`,
        "Use free VITA tax help and choose direct deposit. Filing is the \"application\"; enter the date you file above.",
        today < opens ? opens : today, today < opens ? addDays(opens, 21) : addDays(today, 14)));
      const filedGuess = today < opens ? opens : today;
      const r = refundAfterFiling(filedGuess);
      steps.push(abs("refund", "aid", "Refund arrives", "Direct deposit is fastest. Paper checks take longer.", r.from, r.to));
      return steps;
    }
    steps.push(rel(A, "apply", "you", "Return filed", "Track it with the IRS \"Where's My Refund?\" tool, usually starting 24 hours after e-filing.", 0));
    if (A.getMonth() <= 1 && A < new Date(A.getFullYear(), 1, 15)) {
      steps.push(abs("hold", "agency", "Legal hold ends (PATH Act)", "The IRS can't release refunds with these credits before mid-February.", new Date(A.getFullYear(), 1, 15)));
    }
    const r = refundAfterFiling(A);
    steps.push(abs("refund", "aid", "Refund arrives", "If the IRS sends a letter asking for proof (like your child's school or medical records), answer by the date on the letter.", r.from, r.to));
    return steps;
  }

  const PLANS = {
    snap(ctx, A, today, est) {
      const fast = est.maxDays <= 7;
      return [
        applyStep(A, "Apply for SNAP", "Benefits are counted from this date. You can apply with just your name, address, and signature, and send papers later."),
        rel(A, "interview", "agency", "Interview call", "Usually by phone. Missing it is the most common reason for delays. If you miss it, call to reschedule right away.", fast ? 1 : 3, fast ? 5 : 14),
        rel(A, "docs", "you", "Send any papers they ask for", "Common asks: ID, pay stubs, rent receipt, utility bill. You get at least 10 days from the request.", fast ? 1 : 5, fast ? 10 : 24),
        rel(A, "aid", "aid", "Decision and EBT card", fast ? "Expedited cases must get benefits within 7 days." : "The law requires a decision within 30 days.", fast ? 3 : 10, est.maxDays),
        rel(A, "renew", "renewal", "Renewal", "Most households renew every 6 to 12 months. Watch for a letter, and report big income changes before then.", 180, 365),
      ];
    },
    wic(ctx, A, today, est) {
      return [
        applyStep(A, "Call or go online to ask for a WIC appointment"),
        rel(A, "appt", "you", "Certification appointment", "Bring ID, proof of address, proof of income (or your SNAP/Medicaid card), and the child. Pregnant applicants come themselves.", 1, est.maxDays),
        rel(A, "aid", "aid", "Food benefits loaded on your WIC card", "Usually at the end of your first appointment.", 1, est.maxDays),
        rel(A, "renew", "renewal", "Recertification", "Usually every 6 to 12 months, and again after the baby is born or turns 1.", 180, 365),
      ];
    },
    "school-meals"(ctx, A, today, est) {
      const y = A.getMonth() >= 7 ? A.getFullYear() + 1 : A.getFullYear();
      return [
        applyStep(A, ctx.onSnap || ctx.onTanf ? "Ask the school to confirm automatic approval" : "Turn in the school meal application", "One application covers every child in the household."),
        rel(A, "aid", "aid", "Free or reduced-price meals start", "The school must decide within 10 school days.", est.minDays, est.maxDays),
        abs("renew", "renewal", "New application for next school year", "Approval carries over for the first 30 school days of the next year, then you need a new application.", new Date(y, 7, 1), new Date(y, 8, 15)),
      ];
    },
    "sun-bucks"(ctx, A, today) {
      const s = nextSummer(today);
      return [
        applyStep(A, "Check whether you need to apply", "Usually automatic if you get SNAP or free school meals. If not, your state has an application in the spring."),
        abs("aid", "aid", "SUN Bucks card or deposit", "$120 per child, paid once during summer break.", s.start, s.end),
      ];
    },
    eitc(ctx, A, today, est, applied) { return taxPlan(ctx, A, today, applied, "EITC"); },
    ctc(ctx, A, today, est, applied) { return taxPlan(ctx, A, today, applied, "Child Tax Credit"); },
    "medicaid-adult"(ctx, A, today, est) { return medicaidPlan(ctx, A, today, est, true); },
    "medicaid-kids"(ctx, A, today, est) { return medicaidPlan(ctx, A, today, est, false); },
    marketplace(ctx, A, today) {
      const m = marketplaceStart(A);
      const y = m.start.getFullYear();
      return [
        applyStep(A, "Pick a plan at HealthCare.gov", m.inOpenEnrollment ? "Pick by December 15 to start January 1, or by January 15 to start February 1." : "Outside open enrollment you need a qualifying life event (losing coverage, moving, a new baby)."),
        abs("pay", "you", "Pay your first month's premium", "Coverage doesn't start until the insurer gets your first payment.", addDays(A, 1), addDays(m.start, -1)),
        abs("aid", "aid", "Coverage starts", "Your insurance card arrives by mail; you can usually print a temporary one online.", m.start),
        abs("update", "you", "Report income changes", "If your income changes during the year, update your application so your tax credit stays right.", m.start, new Date(y, 11, 31)),
        abs("renew", "renewal", "Next open enrollment", "Review and renew your plan for the next year.", new Date(y, 10, 1), new Date(y + 1, 0, 15)),
      ];
    },
    "charity-care"(ctx, A) {
      return [
        applyStep(A, "Send the hospital's financial assistance application", "Hospitals must accept it for at least 240 days after your first bill."),
        rel(A, "docs", "you", "Answer any request for missing information", "The hospital must tell you what's missing and give you reasonable time to send it.", 7, 30),
        rel(A, "aid", "aid", "Decision on your bill", "If approved, the bill is reduced or erased, and you may get back what you already paid.", 14, 60),
      ];
    },
    liheap(ctx, A, today, est) {
      if (est.maxDays <= 2) {
        return [
          applyStep(A, "Apply for crisis energy assistance", "Bring your shutoff notice or proof that you're out of fuel."),
          rel(A, "aid", "aid", "Crisis help paid to your utility", "Required within 48 hours, or 18 hours if it's life-threatening.", 0, 2),
          rel(A, "regular", "you", "Apply for regular heating help too", "Crisis aid covers the emergency; regular LIHEAP helps with the rest of the season.", 3, 30),
        ];
      }
      const y = A.getMonth() >= 9 ? A.getFullYear() + 1 : A.getFullYear();
      return [
        applyStep(A, "Apply for LIHEAP", "Funding can run out, so apply as soon as your state's season opens."),
        rel(A, "docs", "you", "Send proof of income and a recent utility bill", "If they ask for more, answer quickly to keep your place in line.", 1, 14),
        rel(A, "aid", "aid", "Payment sent to your utility company", "You'll see a credit on your bill.", est.minDays, est.maxDays),
        abs("renew", "renewal", "Apply again next season", "LIHEAP is yearly. Most states open heating help in the fall.", new Date(y, 9, 1), new Date(y, 11, 31)),
      ];
    },
    weatherization(ctx, A, today, est) {
      return [
        applyStep(A, "Apply with your local weatherization agency", "Renters need the landlord's permission."),
        rel(A, "audit", "agency", "Home energy audit", "An inspector checks your home to decide what work to do.", 30, 180),
        rel(A, "aid", "aid", "Free repairs and upgrades done", "Insulation, sealing, and sometimes furnace work.", est.minDays, est.maxDays),
      ];
    },
    lifeline(ctx, A, today, est) {
      return [
        applyStep(A, "Apply at the National Verifier", "Use your SNAP, Medicaid, or SSI to qualify fastest."),
        rel(A, "docs", "you", "Upload proof if asked", "Only needed if the automatic check can't find you.", 0, 7),
        rel(A, "aid", "aid", "Approved, then pick a phone or internet company", "The $9.25 monthly discount starts once your provider enrolls you.", est.minDays, est.maxDays),
        rel(A, "renew", "renewal", "Yearly recertification", "Confirm every year that you still qualify, or the discount stops.", 335, 365),
      ];
    },
    "head-start"(ctx, A, today, est) {
      return [
        applyStep(A, "Apply at a Head Start center"),
        rel(A, "docs", "you", "Eligibility appointment", "Bring the child's birth certificate and proof of income or benefits.", 3, 21),
        rel(A, "aid", "aid", "Seat offered (or waitlist)", "Programs fill seats by need when they open up.", est.minDays, est.maxDays),
      ];
    },
    childcare(ctx, A, today, est) {
      return [
        applyStep(A, "Apply for child care assistance"),
        rel(A, "docs", "you", "Send your work or school schedule and income", "These decide how many hours are covered and your copay.", 3, 21),
        rel(A, "aid", "aid", "Approval (or waitlist)", "Once approved, you choose a provider who accepts the subsidy.", est.minDays, est.maxDays),
        rel(A, "renew", "renewal", "Renewal", "Federal rules give at least 12 months of eligibility before you must renew.", 335, 365),
      ];
    },
    pell(ctx, A, today, est) {
      const y = A.getMonth() >= 9 ? A.getFullYear() + 1 : A.getFullYear();
      return [
        applyStep(A, "Submit the FAFSA"),
        rel(A, "results", "agency", "FAFSA results", "You'll get a summary within days of submitting.", 1, 5),
        rel(A, "verify", "you", "Send documents if selected for verification", "Some students are asked to prove income or household size. Answer by the school's deadline.", 14, 45),
        rel(A, "aid", "aid", "Pell Grant paid through your school", "Usually at the start of each term.", est.minDays, est.maxDays),
        abs("renew", "renewal", "Fill out the FAFSA again", "Every school year. The new form opens around October 1.", new Date(y, 9, 1), new Date(y, 11, 31)),
      ];
    },
    tanf(ctx, A, today, est) {
      return [
        applyStep(A, "Apply for TANF"),
        rel(A, "interview", "you", "Interview and work-program orientation", "Most adults must join work activities unless exempt.", 5, 21),
        rel(A, "aid", "aid", "Decision and first payment", "Each state sets its own timeline.", est.minDays, est.maxDays),
        rel(A, "renew", "renewal", "Renewal", "Usually every 6 to 12 months. Federal TANF has a 5-year lifetime limit.", 180, 365),
      ];
    },
    ssi(ctx, A, today, est) {
      const disability = est.basis === "average";
      return [
        applyStep(A, "Apply or set a filing date with Social Security", "Calling to set a filing date protects your back pay."),
        rel(A, "interview", "agency", "Interview with Social Security", "By phone or at the local office.", 14, 45),
        ...(disability ? [rel(A, "medical", "you", "Medical records (and maybe an exam)", "Send records from every doctor. You may be asked to see a doctor Social Security pays for.", 30, 120)] : []),
        rel(A, "aid", "aid", "Decision and first payment", "Back pay usually covers the months since you applied.", est.minDays, est.maxDays),
        rel(A, "renew", "renewal", "Periodic review", "Social Security checks income and resources from time to time; report changes by the 10th of the next month.", 365, 730),
      ];
    },
    housing(ctx, A, today, est) {
      return [
        applyStep(A, "Get on the waitlist", "Apply to every open list near you."),
        rel(A, "update", "you", "Answer waitlist update letters", "Many housing authorities remove people who don't respond. Keep your address and phone current.", 300, 365),
        rel(A, "aid", "aid", "Voucher offered", "Waits are often measured in years.", est.minDays, est.maxDays),
        rel(A, "search", "you", "Find a unit before the voucher expires", "Vouchers usually give you about 60 days to find a place (extensions are sometimes possible).", est.maxDays, est.maxDays + 60),
      ];
    },
    unclaimed(ctx, A, today, est) {
      return [
        applyStep(A, "File a claim on your state's official site", "It's free. Never pay a \"finder\" company."),
        rel(A, "docs", "you", "Send proof of identity and address", "The state may ask for more if the money is old.", 3, 30),
        rel(A, "aid", "aid", "Payment", "By check or direct deposit.", est.minDays, est.maxDays),
      ];
    },
  };

  function medicaidPlan(ctx, A, today, est, adult) {
    const steps = [
      applyStep(A, adult ? "Apply for Medicaid" : "Apply for Medicaid / CHIP for your kids", "Coverage can start in the month you apply, and may be backdated for recent bills."),
      rel(A, "docs", "you", "Answer any request for documents", "Read every letter. Missing a deadline is a common reason for denial.", 7, 30),
      rel(A, "aid", "aid", "Decision and coverage", est.maxDays > 45 ? "Disability-based applications can take up to 90 days." : "Required within 45 days.", est.minDays, est.maxDays),
    ];
    const jan2027 = new Date(2027, 0, 1);
    // H.R. 1 work reporting: expansion adults 19–64, with exemptions (pregnancy, disability, parents of kids 13 and under, others).
    const workRule = adult && ctx.expansion && !ctx.h.pregnant && !ctx.hasDisabled && !ctx.hasSenior &&
      !ctx.children.some((a) => a <= 13);
    if (workRule) {
      const start = A < jan2027 ? jan2027 : A;
      steps.push(abs("work", "you", "Show work, school, or volunteer hours",
        "Starting January 1, 2027 (some states later), many adults 19–64 must show 80 hours a month of work, school, or volunteering, or $580 a month in income, unless exempt.",
        start, addDays(start, 30)));
    }
    const renewAt = addDays(A, 365);
    const sixMonth = adult && ctx.expansion && addDays(A, 180) >= new Date(2026, 11, 31);
    steps.push(sixMonth
      ? rel(A, "renew", "renewal", "Renewal (every 6 months)", "Under H.R. 1, expansion adults renew every 6 months for renewals from December 31, 2026.", 165, 180)
      : abs("renew", "renewal", "Yearly renewal", "Return the renewal form by its deadline, even if nothing changed.", addDays(renewAt, -30), renewAt));
    return steps;
  }

  const DONE_LABEL = { you: "Done", agency: "Happened", aid: "Received", renewal: "Done" };

  /**
   * The timeline for one program.
   * tracking: { appliedOn: "YYYY-MM-DD"|null, done: {stepKey: true}, notes: [{date, text}] }
   * Returns { estimated, applied, items (steps + notes, sorted by date), arrival, next }.
   */
  /**
   * Fallback for programs without researched timing (e.g. Canada and Mexico for now):
   * the same tracker, but only the application date is dated. We don't invent dates.
   */
  function genericPlan(A, source) {
    return {
      summary: {
        basis: "unknown",
        label: "Timing varies",
        details: ["We haven't checked official processing times for this program yet."],
        speedUp: ["Check the program's official page for current processing times and registration dates."],
        source: source || { label: "Official program page", url: "" },
      },
      steps: [
        rel(A, "apply", "you", "Apply", "Your application date. Keep a copy or screenshot of what you sent.", 0),
        { key: "docs", kind: "you", title: "Answer any request for documents", detail: "Respond by the date on the letter or message you receive.", from: null, to: null },
        { key: "aid", kind: "aid", title: "Decision and first payment", detail: "Timing varies. Check the official page, and add an update here when you hear back.", from: null, to: null },
      ],
    };
  }

  function buildTimeline(programId, household, tracking, today = new Date(), opts = {}) {
    const t = tracking || {};
    const applied = parseISO(t.appliedOn);
    const day = startOfDay(today);
    const A = applied || day;
    const done = t.done || {};

    let est;
    let planSteps;
    if (PLANS[programId] && ESTIMATORS[programId] && Rules) {
      const ctx = Rules.buildContext(household);
      est = ESTIMATORS[programId](ctx, A);
      planSteps = PLANS[programId](ctx, A, applied ? A : day, est, !!applied);
    } else {
      const g = genericPlan(A, opts.source);
      est = g.summary;
      planSteps = g.steps;
    }

    const steps = planSteps.map((s) => {
      let status;
      if (s.key === "apply") status = applied ? "done" : "now";
      else if (done[s.key]) status = "done";
      else if (!applied) status = "planned";
      else if (!s.to) status = "upcoming"; // undated step
      else if (s.to < day) status = s.kind === "you" ? "overdue" : s.kind === "renewal" ? "now" : "late";
      else if (s.from <= day) status = "now";
      else status = "upcoming";
      return { ...s, type: "step", status, doneLabel: DONE_LABEL[s.kind] };
    });

    const notes = (t.notes || [])
      .map((n, i) => ({ type: "note", index: i, date: parseISO(n.date) || day, text: String(n.text || "") }))
      .filter((n) => n.text.trim());

    // Undated steps keep their place right after the previous dated step.
    let lastDate = A;
    const stepItems = steps.map((s, i) => {
      if (s.from) lastDate = s.from;
      return { ...s, sortDate: s.from || lastDate, order: i };
    });
    const items = [...stepItems, ...notes.map((n) => ({ ...n, sortDate: n.date, order: 1000 + n.index }))]
      .sort((a, b) => a.sortDate - b.sortDate || (a.type === "note") - (b.type === "note") || a.order - b.order);

    const aid = steps.find((s) => s.kind === "aid");
    const next = steps.find((s) => s.status === "overdue") || steps.find((s) => s.status === "now" && s.key !== "apply" && s.kind === "you") ||
      steps.find((s) => s.status === "upcoming" || s.status === "now" || s.status === "planned");
    return {
      estimated: !applied,
      applied,
      items,
      steps,
      arrival: aid ? { from: aid.from, to: aid.to, received: aid.status === "done", late: aid.status === "late" } : null,
      next: next && next.key !== "apply" ? next : steps.find((s) => s.key !== "apply" && s.status !== "done") || null,
      summary: est,
    };
  }

  const API = {
    addTiming, bucketOf, taxRefundWindow, marketplaceStart, nextSummer, refundAfterFiling,
    buildTimeline, toISO, parseISO, fmtDate, PLANS, BUCKETS, BASIS_LABEL, ESTIMATORS,
  };
  root.ClaimableTiming = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
