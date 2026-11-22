/* Canadian federal eligibility evaluators. */
(function (root) {
  "use strict";

  const D = root.ClaimableCAData || (typeof require !== "undefined" ? require("./ca-data.js") : null);

  function moneyCAD(n) {
    return "CA$" + Math.round(n).toLocaleString("en-CA");
  }

  function kidCountKey(n) {
    return Math.min(4, Math.max(1, n));
  }

  /** Annual CCB for July 2025–June 2026 using CRA calculation sheet. Shared custody → half. */
  function ccbAnnual(children, afni, sharedCustody) {
    const under18 = (children || []).filter((a) => Number.isFinite(a) && a >= 0 && a < 18);
    if (!under18.length) return { annual: 0, max: 0 };
    let max = 0;
    under18.forEach((age) => {
      max += age < 6 ? D.ccb.under6 : D.ccb.ages6to17;
    });
    const n = kidCountKey(under18.length);
    let reduction = 0;
    if (afni > D.ccb.threshold1) {
      const band1 = Math.min(afni, D.ccb.threshold2) - D.ccb.threshold1;
      reduction += band1 * D.ccb.phase1Rate[n];
      if (afni > D.ccb.threshold2) {
        const over2 = afni - D.ccb.threshold2;
        reduction += D.ccb.phase2Fixed[n] + over2 * D.ccb.phase2Rate[n];
      }
    }
    let annual = Math.max(0, max - reduction);
    if (sharedCustody) annual = annual / 2;
    return { annual: Math.round(annual), max: Math.round(max) };
  }

  function buildContext(h) {
    const children = (h.children || []).filter((a) => Number.isFinite(a) && a >= 0);
    const adults = Math.max(1, h.adults || 1);
    const afniUnknown = h.afniUnknown === true || h.afniAnnual === null || h.afniAnnual === undefined || h.afniAnnual === "";
    const afniAnnual = afniUnknown ? null : Math.max(0, Number(h.afniAnnual) || 0);
    const applicantAge = Number.isFinite(h.applicantAge) ? Number(h.applicantAge) : null;
    return {
      province: h.province || "",
      adults,
      seniors: h.seniors || 0,
      children,
      size: adults + children.length,
      married: !!h.married,
      primaryCaregiver: !!h.primaryCaregiver,
      taxResident: !!h.taxResident,
      eligibleStatus: h.eligibleStatus || "unknown",
      sharedCustody: !!h.sharedCustody,
      afniUnknown,
      afniAnnual,
      applicantAge,
      yearsInCanadaAfter18: Number.isFinite(h.yearsInCanadaAfter18) ? Number(h.yearsInCanadaAfter18) : null,
      yearsUnknown: h.yearsUnknown === true,
      legalStatusOk: h.legalStatusOk !== false,
      dtc: h.dtc || "no",
      hasDentalCoverage: !!h.hasDentalCoverage,
      enrolled: h.enrolled || {},
      currency: "CAD",
    };
  }

  const PROGRAMS = [
    {
      id: "ca-ccb",
      name: "Canada Child Benefit",
      category: "Children",
      kind: "cash",
      blurb: "Monthly tax-free payment to help with the cost of raising children under 18.",
      apply: { label: "Apply / register with CRA", url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview.html" },
      source: D.ccb.source,
      docs: ["Social Insurance Number (on the application — not entered here)", "Birth certificates or immigration documents for each child", "Tax returns for you and your spouse/partner for the base year"],
      evaluate(ctx) {
        if (ctx.enrolled.ccb) return { status: "enrolled", reasons: ["You already receive the Canada Child Benefit."] };
        const kids = ctx.children.filter((a) => a < 18);
        const missing = [];
        if (!kids.length) {
          return { status: "unlikely", reasons: ["CCB requires at least one child under 18 living with you."] };
        }
        if (!ctx.primaryCaregiver) missing.push("primaryCaregiver");
        if (!ctx.taxResident) missing.push("taxResident");
        if (ctx.eligibleStatus === "unknown" || !ctx.eligibleStatus) missing.push("eligibleStatus");
        if (ctx.afniUnknown) missing.push("afniAnnual");

        if (ctx.eligibleStatus === "ineligible") {
          return { status: "unlikely", reasons: ["CCB requires the applicant or spouse/partner to be a Canadian citizen, permanent resident, protected person, temporary resident who has lived in Canada for the prior 18 months, or an Indigenous person under the Indian Act."] };
        }
        if (!ctx.primaryCaregiver || !ctx.taxResident) {
          return {
            status: "maybe",
            reasons: ["CCB needs a primary caregiver who is a tax resident of Canada. Confirm caregiving and tax residence, then apply through CRA."],
            missingQuestions: missing,
          };
        }
        if (missing.includes("eligibleStatus") || missing.includes("afniAnnual")) {
          return {
            status: "maybe",
            reasons: ["You may qualify for CCB. Answer status and prior-year adjusted family net income so we can estimate your payment."],
            missingQuestions: missing,
            applicationAvailability: "continuous",
          };
        }
        const est = ccbAnnual(kids, ctx.afniAnnual, ctx.sharedCustody);
        if (est.annual <= 0) {
          return {
            status: "maybe",
            reasons: [
              `With AFNI of ${moneyCAD(ctx.afniAnnual)}, the CRA reduction schedule may bring CCB to zero. Confirm with the CRA calculator.`,
            ],
            annual: 0,
            valueLabel: "agency calculates",
          };
        }
        const reasons = [
          `You care for ${kids.length} child${kids.length > 1 ? "ren" : ""} under 18 and meet the main CRA eligibility tests we can check.`,
          `Estimate for ${D.ccb.benefitYear} (based on ${D.ccb.afniTaxYear} AFNI): about ${moneyCAD(est.annual)} per year (${moneyCAD(est.annual / 12)}/month).`,
        ];
        if (ctx.sharedCustody) reasons.push("Shared custody (about 40–60% of the time) usually means each caregiver receives half of the CCB.");
        return {
          status: "likely",
          reasons,
          annual: est.annual,
          valueLabel: `about ${moneyCAD(est.annual / 12)}/month`,
          currency: "CAD",
          cadence: "monthly",
          applicationAvailability: "continuous",
        };
      },
    },
    {
      id: "ca-oas",
      name: "Old Age Security",
      category: "Seniors",
      kind: "cash",
      blurb: "Monthly pension for people 65+ who meet Canadian residence and legal-status rules.",
      apply: { label: "Apply for OAS", url: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/apply.html" },
      source: D.oas.source,
      docs: ["Proof of age and identity", "Residence history in Canada after age 18", "Social Insurance Number (on the application)"],
      evaluate(ctx) {
        if (ctx.enrolled.oas) return { status: "enrolled", reasons: ["You already receive Old Age Security."] };
        const age = ctx.applicantAge;
        if (age === null) {
          return { status: "maybe", reasons: ["Tell us the applicant's age to check OAS."], missingQuestions: ["applicantAge"] };
        }
        if (age < 65) {
          return { status: "unlikely", reasons: [`OAS starts at age 65. You entered age ${age}.`] };
        }
        if (!ctx.legalStatusOk) {
          return { status: "unlikely", reasons: ["OAS requires Canadian citizenship or legal resident status."] };
        }
        if (ctx.yearsUnknown || ctx.yearsInCanadaAfter18 === null) {
          return {
            status: "maybe",
            reasons: ["OAS needs at least 10 years of residence in Canada after age 18 (or an international social-security agreement). Enter years of residence for a clearer result."],
            missingQuestions: ["yearsInCanadaAfter18"],
          };
        }
        if (ctx.yearsInCanadaAfter18 < D.oas.minResidenceYears) {
          return {
            status: "maybe",
            reasons: [`You reported ${ctx.yearsInCanadaAfter18} years in Canada after 18. The usual minimum is 10 years (agreements can help). Check with Service Canada.`],
          };
        }
        const monthly = age >= 75 ? D.oas.monthly75plus : D.oas.monthly65to74;
        const partial = Math.min(1, ctx.yearsInCanadaAfter18 / D.oas.fullResidenceYears);
        const estMonthly = Math.round(monthly * partial * 100) / 100;
        const reasons = [
          `Age ${age} with ${ctx.yearsInCanadaAfter18} years of residence after 18 meets the main OAS tests we can check.`,
          partial < 1
            ? `Partial pension estimate: about ${moneyCAD(estMonthly)}/month (${Math.round(partial * 40)}/40ths of the maximum ${moneyCAD(monthly)}).`
            : `Full pension maximum (Oct–Dec 2025 rates): about ${moneyCAD(monthly)}/month.`,
        ];
        return {
          status: "likely",
          reasons,
          annual: Math.round(estMonthly * 12),
          valueLabel: `about ${moneyCAD(estMonthly)}/month`,
          currency: "CAD",
          cadence: "monthly",
          applicationAvailability: "continuous",
        };
      },
    },
    {
      id: "ca-gis",
      name: "Guaranteed Income Supplement",
      category: "Seniors",
      kind: "cash",
      blurb: "Extra monthly amount for OAS pensioners with little other income.",
      apply: { label: "GIS information", url: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/guaranteed-income-supplement.html" },
      source: D.gis.source,
      docs: ["OAS enrollment or application", "Income information for you and your spouse/partner"],
      evaluate(ctx) {
        if (ctx.enrolled.gis) return { status: "enrolled", reasons: ["You already receive the Guaranteed Income Supplement."] };
        const age = ctx.applicantAge;
        if (age === null || age < 65) {
          return { status: "unlikely", reasons: ["GIS is for OAS pensioners aged 65+."] };
        }
        if (ctx.afniUnknown) {
          return {
            status: "maybe",
            reasons: ["GIS depends on your (and your partner's) income excluding OAS. Enter annual income other than OAS for an estimate."],
            missingQuestions: ["afniAnnual"],
          };
        }
        const income = ctx.afniAnnual; // reused field: other annual income for GIS screening
        const cutoff = ctx.married ? D.gis.coupleBothOasCutoff : D.gis.singleCutoff;
        const maxM = ctx.married ? D.gis.coupleBothOasMaxMonthly : D.gis.singleMaxMonthly;
        if (income > cutoff) {
          return {
            status: "unlikely",
            reasons: [`Income around ${moneyCAD(income)} is above the published GIS cut-off near ${moneyCAD(cutoff)} (Oct–Dec 2025 table, excluding OAS).`],
          };
        }
        // Rough linear phase-out: $1 GIS per $2 of other income (simplified)
        const estMonthly = Math.max(0, Math.round((maxM - income / 24) * 100) / 100);
        return {
          status: "likely",
          reasons: [
            "As an OAS-age senior with income under the GIS cut-off, you may receive GIS.",
            `Rough estimate using the single/couple maximum and a simplified $1-per-$2 reduction: about ${moneyCAD(estMonthly)}/month. Service Canada decides the exact amount.`,
          ],
          annual: Math.round(estMonthly * 12),
          valueLabel: `about ${moneyCAD(estMonthly)}/month`,
          currency: "CAD",
          cadence: "monthly",
          applicationAvailability: "continuous",
        };
      },
    },
    {
      id: "ca-cdb",
      name: "Canada Disability Benefit",
      category: "Disability",
      kind: "cash",
      blurb: "Monthly benefit for working-age people who are approved for the Disability Tax Credit.",
      apply: { label: "Canada Disability Benefit", url: "https://www.canada.ca/en/services/benefits/disability/canada-disability-benefit.html" },
      source: D.cdb.source,
      docs: ["Disability Tax Credit approval", "Tax filings", "Proof of residence/status"],
      evaluate(ctx) {
        if (ctx.enrolled.cdb) return { status: "enrolled", reasons: ["You already receive the Canada Disability Benefit."] };
        const age = ctx.applicantAge;
        if (age !== null && (age < 18 || age >= 65)) {
          return { status: "unlikely", reasons: ["CDB is aimed at working-age adults (typically 18–64) with an approved Disability Tax Credit."] };
        }
        if (ctx.dtc === "no") {
          return { status: "unlikely", reasons: ["CDB requires Disability Tax Credit approval (or an equivalent determination)."] };
        }
        if (ctx.dtc === "pending") {
          return {
            status: "maybe",
            reasons: ["Your DTC application is pending. If approved, you may qualify for CDB — amount is set by the agency.", D.cdb.note],
            missingQuestions: ["dtc"],
            valueLabel: "agency calculates",
          };
        }
        return {
          status: "likely",
          reasons: [
            "With an approved Disability Tax Credit and working-age status, you may qualify for CDB.",
            D.cdb.note,
            `Published maximum reference: about ${moneyCAD(D.cdb.maxMonthly)}/month before income adjustments.`,
          ],
          annual: D.cdb.maxMonthly * 12,
          valueLabel: `up to ~${moneyCAD(D.cdb.maxMonthly)}/month`,
          currency: "CAD",
          cadence: "monthly",
          applicationAvailability: "continuous",
        };
      },
    },
    {
      id: "ca-cdcp",
      name: "Canadian Dental Care Plan",
      category: "Health",
      kind: "service",
      blurb: "Dental coverage for eligible uninsured Canadian residents under the income limit.",
      apply: { label: "Canadian Dental Care Plan", url: "https://www.canada.ca/en/services/benefits/dental/dental-care-plan.html" },
      source: D.cdcp.source,
      docs: ["Tax return / income information", "Proof you do not have dental insurance"],
      evaluate(ctx) {
        if (ctx.enrolled.cdcp) return { status: "enrolled", reasons: ["You already have Canadian Dental Care Plan coverage."] };
        if (ctx.hasDentalCoverage) {
          return { status: "unlikely", reasons: ["CDCP is for people without access to dental insurance."] };
        }
        if (!ctx.taxResident) {
          return { status: "maybe", reasons: ["CDCP requires Canadian residence for tax purposes."], missingQuestions: ["taxResident"] };
        }
        if (ctx.afniUnknown) {
          return {
            status: "maybe",
            reasons: [`CDCP uses family income (limit near ${moneyCAD(D.cdcp.incomeLimit)}). Enter income to refine this result.`],
            missingQuestions: ["afniAnnual"],
          };
        }
        if (ctx.afniAnnual > D.cdcp.incomeLimit) {
          return {
            status: "unlikely",
            reasons: [`Family income of ${moneyCAD(ctx.afniAnnual)} is above the published CDCP income limit of ${moneyCAD(D.cdcp.incomeLimit)}.`],
          };
        }
        return {
          status: "likely",
          reasons: [
            `Income under ${moneyCAD(D.cdcp.incomeLimit)} and no dental insurance — you may qualify for CDCP coverage (copayments can apply).`,
          ],
          annual: 0,
          valueLabel: "coverage (not cash)",
          currency: "CAD",
          applicationAvailability: "continuous",
        };
      },
    },
  ];

  function screen(household) {
    const ctx = buildContext(household);
    const ORDER = { likely: 0, maybe: 1, enrolled: 2, unlikely: 3 };
    const results = PROGRAMS.map((p) => {
      const r = p.evaluate(ctx) || { status: "unlikely" };
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        kind: p.kind,
        blurb: p.blurb,
        apply: p.apply,
        source: p.source,
        docs: p.docs,
        status: r.status,
        reasons: r.reasons || [],
        annual: r.annual || 0,
        valueLabel: r.valueLabel || "",
        currency: r.currency || "CAD",
        cadence: r.cadence || "",
        applicationAvailability: r.applicationAvailability || "",
        missingQuestions: r.missingQuestions || [],
      };
    }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.annual - a.annual);

    const likelyCash = results.filter((r) => r.status === "likely" && r.kind === "cash" && r.annual > 0);
    const maybeCash = results.filter((r) => r.status === "maybe" && r.kind === "cash" && r.annual > 0);
    return {
      country: "CA",
      currency: "CAD",
      ctx: {
        size: ctx.size,
        province: ctx.province,
        afniAnnual: ctx.afniAnnual,
        afniUnknown: ctx.afniUnknown,
        pct: null,
      },
      results,
      totals: {
        likelyAnnual: likelyCash.reduce((s, r) => s + r.annual, 0),
        maybeAnnual: maybeCash.reduce((s, r) => s + r.annual, 0),
        likelyCount: results.filter((r) => r.status === "likely").length,
        maybeCount: results.filter((r) => r.status === "maybe").length,
      },
      asOf: D.asOf,
    };
  }

  const API = { screen, buildContext, ccbAnnual, PROGRAMS };
  root.ClaimableCA = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
