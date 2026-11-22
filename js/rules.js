(function (root) {
  "use strict";

  const D = root.ClaimableData || (typeof require !== "undefined" ? require("./data.js") : null);

  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const pctStr = (n) => Math.round(n) + "%";

  function buildContext(h) {
    const children = (h.children || []).filter((a) => Number.isFinite(a) && a >= 0);
    const adults = Math.max(1, h.adults || 1);
    const size = adults + children.length;
    const earnedMonthly = Math.max(0, h.earnedMonthly || 0);
    const otherMonthly = Math.max(0, h.otherMonthly || 0);
    const grossMonthly = earnedMonthly + otherMonthly;
    const fplAnnual = D.fplFor(size, h.state);
    const enrolled = h.enrolled || {};
    return {
      h,
      size,
      adults,
      children,
      kidsUnder1: children.filter((a) => a < 1).length,
      kidsUnder5: children.filter((a) => a < 5).length,
      kidsUnder6: children.filter((a) => a < 6).length,
      kidsUnder13: children.filter((a) => a < 13).length,
      kidsUnder17: children.filter((a) => a < 17).length,
      kidsUnder19: children.filter((a) => a < 19).length,
      kidsUnder21: children.filter((a) => a < 21).length,
      kidsSchoolAge: children.filter((a) => a >= 5 && a <= 18).length,
      earnedMonthly,
      otherMonthly,
      grossMonthly,
      grossAnnual: grossMonthly * 12,
      earnedAnnual: earnedMonthly * 12,
      fplAnnual,
      fplMonthly: fplAnnual / 12,
      pct: fplAnnual > 0 ? ((grossMonthly * 12) / fplAnnual) * 100 : 0,
      hasSenior: (h.seniors || 0) > 0,
      hasDisabled: !!h.disabled,
      elderlyOrDisabled: (h.seniors || 0) > 0 || !!h.disabled,
      expansion: !D.nonExpansionStates.includes(h.state),
      enrolled,
      onSnap: !!enrolled.snap,
      onMedicaid: !!enrolled.medicaid,
      onTanf: !!enrolled.tanf,
      onSsi: !!enrolled.ssi,
    };
  }

  function snapMonthly(ctx) {
    const S = D.snap;
    const n = ctx.size;
    const maxA = n <= 8 ? S.maxAllotment[n - 1] : S.maxAllotment[7] + (n - 8) * S.maxAllotmentPerExtra;
    const stdDed = S.standardDeduction[Math.min(n, 6)];
    let adjusted = ctx.grossMonthly - ctx.earnedMonthly * S.earnedIncomeDeduction - stdDed;
    adjusted = Math.max(0, adjusted);
    const shelter = Math.max(0, (ctx.h.rentMonthly || 0) + (ctx.h.utilitiesMonthly || 0));
    let excessShelter = Math.max(0, shelter - adjusted / 2);
    if (!ctx.elderlyOrDisabled) excessShelter = Math.min(excessShelter, S.maxExcessShelter);
    const net = Math.max(0, adjusted - excessShelter);
    let benefit = maxA - 0.3 * net;
    if (benefit <= 0) return { benefit: 0, net, maxA };
    if (n <= 2) benefit = Math.max(benefit, S.minimumBenefit);
    return { benefit: Math.round(benefit), net: Math.round(net), maxA };
  }

  function eitcAmount(ctx) {
    const E = D.eitc;
    if (ctx.h.investmentOver) return 0;
    const kids = Math.min(3, ctx.kidsUnder19);
    if (kids === 0 && !ctx.h.adultWorkingAge) return 0;
    const p = E.byKids[kids];
    const earned = ctx.earnedAnnual;
    const agi = ctx.earnedAnnual + ctx.otherMonthly * 12;
    let credit = Math.min(p.max, earned * p.phaseInRate);
    const start = p.phaseOutStart + (ctx.h.married ? E.marriedBump : 0);
    const income = Math.max(agi, earned);
    if (income > start) credit -= p.phaseOutRate * (income - start);
    return Math.max(0, Math.round(credit));
  }

  function ctcRefundable(ctx) {
    const C = D.ctc;
    const k = ctx.kidsUnder17;
    if (k === 0) return 0;
    const byEarnings = Math.max(0, (ctx.earnedAnnual - C.earnedThreshold) * C.phaseInRate);
    return Math.round(Math.min(k * C.refundablePerChild, byEarnings));
  }

  const PROGRAMS = [
    {
      id: "snap",
      name: "SNAP (food stamps)",
      category: "Food",
      kind: "cash",
      blurb: "Money on an EBT card every month for groceries.",
      apply: { label: "Find your state's SNAP office", url: "https://www.fns.usda.gov/snap/state-directory" },
      source: { label: "USDA SNAP FY2027 limits", url: "https://www.fns.usda.gov/snap/allotment/cola" },
      docs: ["Photo ID", "Pay stubs from the last 30 days", "Rent or mortgage statement", "Utility bills"],
      evaluate(ctx) {
        if (ctx.onSnap) return { status: "enrolled" };
        const reasons = [];
        const grossLimit = ctx.fplMonthly * 1.3;
        const est = snapMonthly(ctx);
        reasons.push(`Your household income is ${pctStr(ctx.pct)} of the federal poverty line.`);
        if (!ctx.elderlyOrDisabled && ctx.grossMonthly > grossLimit) {
          if (ctx.grossMonthly <= ctx.fplMonthly * 2 && est.benefit > 0) {
            reasons.push(`That's above the usual 130% limit (${money(grossLimit)}/month), but many states use a higher limit up to 200%.`);
            return { status: "maybe", reasons, annual: est.benefit * 12, valueLabel: `about ${money(est.benefit)}/month if your state uses the higher limit` };
          }
          reasons.push(`The gross income limit for ${ctx.size} people is ${money(grossLimit)}/month.`);
          return { status: "unlikely", reasons };
        }
        if (ctx.elderlyOrDisabled) reasons.push("Households with someone 65+ or disabled skip the gross income test.");
        else reasons.push(`That's under the 130% limit of ${money(grossLimit)}/month for ${ctx.size} people.`);
        if (est.benefit <= 0) {
          reasons.push("After deductions, the formula comes out to $0 for your household.");
          return { status: "unlikely", reasons };
        }
        reasons.push(`Estimated benefit: max ${money(est.maxA)} minus 30% of your net income (${money(est.net)}).`);
        return { status: "likely", reasons, annual: est.benefit * 12, valueLabel: `about ${money(est.benefit)}/month` };
      },
    },
    {
      id: "wic",
      name: "WIC",
      category: "Food",
      kind: "cash",
      blurb: "Healthy food, formula, and nutrition help for pregnant people, new moms, babies, and kids under 5.",
      apply: { label: "How to apply for WIC", url: "https://www.fns.usda.gov/wic/wic-how-apply" },
      source: { label: "USDA WIC eligibility", url: "https://www.fns.usda.gov/wic/wic-eligibility-requirements" },
      docs: ["Photo ID", "Proof of address", "Proof of income, or your SNAP/Medicaid card", "Child's birth certificate or immunization record"],
      evaluate(ctx) {
        if (ctx.enrolled.wic) return { status: "enrolled" };
        const people = ctx.kidsUnder5 + (ctx.h.pregnant ? 1 : 0);
        if (people === 0) return { status: "unlikely", reasons: ["WIC is for pregnant or postpartum people and children under 5."] };
        const reasons = [];
        const annual = people * D.estimates.wicPerPersonMonthly * 12;
        if (ctx.onSnap || ctx.onMedicaid || ctx.onTanf) {
          reasons.push("You get SNAP, Medicaid, or TANF, which automatically meets WIC's income rule.");
          return { status: "likely", reasons, annual, valueLabel: `about ${money(annual / 12)}/month in food (estimate)` };
        }
        reasons.push(`Your income is ${pctStr(ctx.pct)} of the poverty line; WIC's limit is 185%.`);
        if (ctx.pct <= 185) return { status: "likely", reasons, annual, valueLabel: `about ${money(annual / 12)}/month in food (estimate)` };
        if (ctx.pct <= 200) return { status: "maybe", reasons: [...reasons, "You're close to the line. If you qualify for Medicaid, you qualify for WIC."], annual, valueLabel: "food package (estimate)" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "school-meals",
      name: "Free or reduced-price school meals",
      category: "Food",
      kind: "cash",
      blurb: "Free breakfast and lunch at school.",
      apply: { label: "Apply through your child's school", url: "https://www.fns.usda.gov/nslp/applying-free-and-reduced-price-school-meals" },
      source: { label: "USDA 2026–27 income guidelines", url: "https://www.fns.usda.gov/schoolmeals/fr-040926" },
      docs: ["School meal application (one per household)", "Income info or your SNAP/TANF case number"],
      evaluate(ctx) {
        if (ctx.enrolled.schoolMeals) return { status: "enrolled" };
        const k = ctx.kidsSchoolAge;
        if (k === 0) return { status: "unlikely", reasons: ["No school-age children listed."] };
        const reasons = [];
        if (ctx.onSnap || ctx.onTanf) {
          reasons.push("Kids in SNAP or TANF households get free meals automatically. Ask the school to confirm they're on the list.");
          return { status: "likely", reasons, annual: k * D.estimates.schoolMealsFreePerChildYear, valueLabel: `about ${money(D.estimates.schoolMealsFreePerChildYear)}/child per school year (estimate)` };
        }
        reasons.push(`Your income is ${pctStr(ctx.pct)} of the poverty line. Free meals: up to 130%. Reduced price: up to 185%.`);
        if (ctx.pct <= 130) return { status: "likely", reasons, annual: k * D.estimates.schoolMealsFreePerChildYear, valueLabel: "free meals" };
        if (ctx.pct <= 185) return { status: "likely", reasons, annual: k * D.estimates.schoolMealsReducedPerChildYear, valueLabel: "reduced-price meals (40¢ lunch max)" };
        return { status: "unlikely", reasons: [...reasons, "Many schools give free meals to everyone anyway (Community Eligibility). Ask yours."] };
      },
    },
    {
      id: "sun-bucks",
      name: "SUN Bucks (Summer EBT)",
      category: "Food",
      kind: "cash",
      blurb: "$120 per child for groceries over the summer.",
      apply: { label: "SUN Bucks by state", url: "https://www.fns.usda.gov/summer/sunbucks" },
      source: { label: "USDA SUN Bucks", url: "https://www.fns.usda.gov/summer/sunbucks" },
      docs: ["Often automatic if your kids get free/reduced meals or you get SNAP"],
      evaluate(ctx) {
        const k = ctx.kidsSchoolAge;
        if (k === 0) return { status: "unlikely", reasons: ["No school-age children listed."] };
        if (D.sunBucksOptOut.includes(ctx.h.state)) {
          return { status: "unlikely", reasons: ["Your state did not run SUN Bucks in 2026. Look for free summer meal sites instead (text \"Summer Meals\" to 914-342-7744)."] };
        }
        const eligible = ctx.onSnap || ctx.onTanf || ctx.onMedicaid || ctx.pct <= 185;
        if (!eligible) return { status: "unlikely", reasons: ["SUN Bucks follows school meal rules (income up to 185% of poverty)."] };
        const annual = k * D.sunBucksPerChild;
        return { status: "likely", reasons: ["Your state runs SUN Bucks and your kids meet the school meal income rule."], annual, valueLabel: `${money(annual)} each summer` };
      },
    },
    {
      id: "eitc",
      name: "Earned Income Tax Credit (EITC)",
      category: "Taxes",
      kind: "cash",
      blurb: "A tax refund for working people. About 1 in 5 people who qualify never claim it.",
      apply: { label: "Free tax help near you (VITA)", url: "https://irs.treasury.gov/freetaxprep/" },
      source: { label: "IRS EITC 2026 limits", url: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/eitc-income-limits-maximum-credit-amounts-and-tax-law-updates" },
      docs: ["W-2s or 1099s", "Social Security numbers for everyone on the return", "Last year's tax return if you have it"],
      evaluate(ctx) {
        if (ctx.earnedAnnual <= 0) return { status: "unlikely", reasons: ["The EITC requires income from work."] };
        if (ctx.h.investmentOver) return { status: "unlikely", reasons: [`Investment income over ${money(D.eitc.investmentIncomeLimit)} rules out the EITC.`] };
        const kids = Math.min(3, ctx.kidsUnder19);
        if (kids === 0 && !ctx.h.adultWorkingAge) return { status: "unlikely", reasons: ["Without a qualifying child, you must be 25–64 to claim the EITC."] };
        const amt = eitcAmount(ctx);
        if (amt <= 0) return { status: "unlikely", reasons: ["Your income is above the EITC limit for your family size."] };
        const reasons = [
          `Based on ${money(ctx.earnedAnnual)}/year from work and ${kids === 3 ? "3 or more" : kids} qualifying ${kids === 1 ? "child" : "children"}.`,
          "You must file a tax return to get it, even if you don't owe tax.",
        ];
        return { status: "likely", reasons, annual: amt, valueLabel: `about ${money(amt)} at tax time` };
      },
    },
    {
      id: "ctc",
      name: "Child Tax Credit",
      category: "Taxes",
      kind: "cash",
      blurb: "Up to $2,200 per child under 17. Many low-income families miss it because they don't file taxes.",
      apply: { label: "Free tax help near you (VITA)", url: "https://irs.treasury.gov/freetaxprep/" },
      source: { label: "IRS Child Tax Credit", url: "https://www.irs.gov/credits-deductions/individuals/child-tax-credit" },
      docs: ["Child's Social Security number", "W-2s or 1099s"],
      evaluate(ctx) {
        if (ctx.kidsUnder17 === 0) return { status: "unlikely", reasons: ["No children under 17 listed."] };
        const refundable = ctcRefundable(ctx);
        if (refundable <= 0 && ctx.earnedAnnual <= D.ctc.earnedThreshold) {
          return { status: "unlikely", reasons: [`The refundable part starts once you earn over ${money(D.ctc.earnedThreshold)} from work.`] };
        }
        const reasons = [
          `${ctx.kidsUnder17} child${ctx.kidsUnder17 > 1 ? "ren" : ""} under 17.`,
          `At least ${money(refundable)} comes back even if you owe no tax. You can get up to ${money(D.ctc.perChild)}/child if you owe income tax.`,
          "Each child needs a Social Security number.",
        ];
        return { status: "likely", reasons, annual: refundable, valueLabel: `at least ${money(refundable)} at tax time` };
      },
    },
    {
      id: "medicaid-adult",
      name: "Medicaid for adults",
      category: "Health",
      kind: "service",
      blurb: "Free or very low-cost health coverage.",
      apply: { label: "Apply at HealthCare.gov or your state", url: "https://www.healthcare.gov/medicaid-chip/getting-medicaid-chip/" },
      source: { label: "KFF Medicaid expansion status", url: "https://www.kff.org/affordable-care-act/state-indicator/state-activity-around-expanding-medicaid-under-the-affordable-care-act/" },
      docs: ["Photo ID", "Proof of income", "Social Security numbers (or immigration documents)"],
      evaluate(ctx) {
        if (ctx.onMedicaid) return { status: "enrolled" };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line.`];
        if (ctx.h.pregnant) {
          reasons.push("Pregnancy Medicaid covers at least up to 138% in every state, and up to about 200% in most.");
          if (ctx.pct <= 138) return { status: "likely", reasons, valueLabel: "free prenatal and delivery care" };
          if (ctx.pct <= 215) return { status: "maybe", reasons, valueLabel: "free prenatal and delivery care" };
        }
        if (ctx.onSsi) return { status: "likely", reasons: ["SSI recipients qualify for Medicaid in most states."], valueLabel: "health coverage" };
        if (ctx.expansion) {
          reasons.push("Your state expanded Medicaid to adults up to 138% of poverty.");
          if (ctx.pct <= 138) return { status: "likely", reasons, valueLabel: "health coverage" };
          return { status: "unlikely", reasons };
        }
        reasons.push("Your state hasn't expanded Medicaid, so adults usually qualify only as very low-income parents, or if disabled, 65+, or pregnant.");
        if (ctx.elderlyOrDisabled || (ctx.children.length > 0 && ctx.pct <= 40)) return { status: "maybe", reasons, valueLabel: "health coverage" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "medicaid-kids",
      name: "Medicaid / CHIP for kids",
      category: "Health",
      kind: "service",
      blurb: "Free or low-cost health and dental coverage for children.",
      apply: { label: "Apply for kids' coverage", url: "https://www.insurekidsnow.gov/" },
      source: { label: "InsureKidsNow.gov", url: "https://www.insurekidsnow.gov/" },
      docs: ["Children's birth certificates or SSNs", "Proof of income"],
      evaluate(ctx) {
        if (ctx.kidsUnder19 === 0) return { status: "unlikely", reasons: ["No children under 19 listed."] };
        if (ctx.onMedicaid) return { status: "enrolled" };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line.`, "Every state covers kids to at least 200%, and most go higher."];
        if (ctx.pct <= 200) return { status: "likely", reasons, valueLabel: "health + dental coverage" };
        if (ctx.pct <= 300) return { status: "maybe", reasons, valueLabel: "health + dental coverage" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "marketplace",
      name: "Health insurance tax credits (HealthCare.gov)",
      category: "Health",
      kind: "service",
      blurb: "Discounts on private health plans for people without job-based coverage.",
      apply: { label: "Shop plans at HealthCare.gov", url: "https://www.healthcare.gov/" },
      source: { label: "KFF: 2026 marketplace changes", url: "https://www.kff.org/affordable-care-act/what-we-know-so-far-about-2026-aca-marketplace-enrollment-premiums-and-deductibles/" },
      docs: ["Income estimate for next year", "SSNs or immigration documents"],
      evaluate(ctx) {
        if (ctx.h.insurance !== "none") return { status: "unlikely", reasons: ["You already have coverage, or coverage through a job."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line. Tax credits cover 100–400%.`];
        const floor = ctx.expansion ? 138 : 100;
        if (ctx.pct >= floor && ctx.pct <= 400) return { status: "likely", reasons, valueLabel: "lower monthly premiums" };
        if (!ctx.expansion && ctx.pct < 100) return { status: "unlikely", reasons: [...reasons, "In your state, people under 100% fall into the 'coverage gap'. Look for community health centers (findahealthcenter.hrsa.gov)."] };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "charity-care",
      name: "Hospital financial assistance (charity care)",
      category: "Health",
      kind: "service",
      blurb: "Nonprofit hospitals must offer free or discounted care. Most people who qualify never apply.",
      apply: { label: "Free help applying (Dollar For)", url: "https://dollarfor.org/" },
      source: { label: "Lown Institute hospital policy data", url: "https://lownhospitalsindex.org/report-hospital-financial-assistance-and-debt-collection-policies/" },
      docs: ["The hospital bill", "Proof of income", "The hospital's financial assistance application"],
      evaluate(ctx) {
        if (!ctx.h.medicalBills) return { status: "unlikely", reasons: ["You didn't mention hospital bills. If you get one, check here again."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line.`];
        if (ctx.pct <= 200) return { status: "likely", reasons: [...reasons, "Most nonprofit hospitals give free care at or below 200%."], valueLabel: "bill reduced or erased" };
        if (ctx.pct <= 400) return { status: "maybe", reasons: [...reasons, "Many hospitals discount bills up to 300–400%."], valueLabel: "possible discount" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "liheap",
      name: "LIHEAP (help with energy bills)",
      category: "Utilities",
      kind: "cash",
      blurb: "Help paying heating and cooling bills. It reaches only about 1 in 6 eligible homes.",
      apply: { label: "Find your LIHEAP office", url: "https://www.acf.hhs.gov/ocs/map/liheap-map-state-and-territory-contact-listing" },
      source: { label: "HHS LIHEAP", url: "https://www.acf.hhs.gov/ocs/programs/liheap" },
      docs: ["Recent utility bill", "Proof of income", "Photo ID"],
      evaluate(ctx) {
        if (ctx.enrolled.liheap) return { status: "enrolled" };
        if (!ctx.h.paysEnergy) return { status: "unlikely", reasons: ["LIHEAP helps households that pay heating or cooling costs."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line. States use 150% of poverty or 60% of state median income.`];
        if (ctx.h.behindUtilities) reasons.push("Behind on bills or facing shutoff? Ask about crisis assistance; it's often faster.");
        const annual = D.estimates.liheapYear;
        if (ctx.pct <= 150 || ctx.onSnap || ctx.onSsi || ctx.onTanf) return { status: "likely", reasons, annual, valueLabel: `often around ${money(annual)}/year (varies)` };
        if (ctx.pct <= 200) return { status: "maybe", reasons, annual, valueLabel: "varies by state" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "weatherization",
      name: "Weatherization Assistance",
      category: "Utilities",
      kind: "service",
      blurb: "Free insulation, sealing, and repairs that cut energy bills for good.",
      apply: { label: "How to apply", url: "https://www.energy.gov/scep/wap/how-apply-weatherization-assistance" },
      source: { label: "DOE Weatherization", url: "https://www.energy.gov/scep/wap/weatherization-assistance-program" },
      docs: ["Proof of income", "Utility bills", "Landlord permission if you rent"],
      evaluate(ctx) {
        if (ctx.h.housing === "homeless") return { status: "unlikely", reasons: ["Weatherization upgrades a home you live in."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line; the limit is 200%.`];
        if (ctx.pct <= 200 || ctx.onSsi || ctx.onTanf) return { status: "likely", reasons, valueLabel: "free home energy upgrades" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "lifeline",
      name: "Lifeline (phone/internet discount)",
      category: "Utilities",
      kind: "cash",
      blurb: "$9.25 off your phone or internet bill every month.",
      apply: { label: "Apply for Lifeline", url: "https://www.lifelinesupport.org/" },
      source: { label: "FCC Lifeline", url: "https://www.fcc.gov/lifeline-consumers" },
      docs: ["Proof of SNAP, Medicaid, SSI, or income"],
      evaluate(ctx) {
        if (ctx.enrolled.lifeline) return { status: "enrolled" };
        const annual = Math.round(D.lifeline.monthly * 12);
        if (ctx.onSnap || ctx.onMedicaid || ctx.onSsi || ctx.enrolled.housing) {
          return { status: "likely", reasons: ["Getting SNAP, Medicaid, SSI, or housing aid qualifies you automatically."], annual, valueLabel: `${money(annual)}/year` };
        }
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line; the limit is 135%.`];
        if (ctx.pct <= D.lifeline.fplPercent) return { status: "likely", reasons, annual, valueLabel: `${money(annual)}/year` };
        return { status: "unlikely", reasons: [...reasons, "Ask your internet provider about its own low-income plan; many have one."] };
      },
    },
    {
      id: "head-start",
      name: "Head Start / Early Head Start",
      category: "Childcare & school",
      kind: "service",
      blurb: "Free preschool and early learning for kids under 5.",
      apply: { label: "Find a Head Start center", url: "https://headstart.gov/center-locator" },
      source: { label: "HHS Head Start eligibility", url: "https://headstart.gov/about-us/article/head-start-services" },
      docs: ["Child's birth certificate", "Proof of income or public assistance"],
      evaluate(ctx) {
        if (ctx.enrolled.headStart) return { status: "enrolled" };
        if (ctx.kidsUnder5 === 0 && !ctx.h.pregnant) return { status: "unlikely", reasons: ["Head Start serves pregnant people and kids under 5."] };
        if (ctx.onTanf || ctx.onSsi || ctx.h.housing === "homeless") {
          return { status: "likely", reasons: ["Families on TANF or SSI, or experiencing homelessness, qualify regardless of income."], valueLabel: "free preschool" };
        }
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line.`];
        if (ctx.pct <= 100) return { status: "likely", reasons: [...reasons, "Families at or below 100% qualify."], valueLabel: "free preschool" };
        if (ctx.pct <= 130) return { status: "maybe", reasons: [...reasons, "Programs can enroll some families up to 130%."], valueLabel: "free preschool" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "childcare",
      name: "Child care assistance",
      category: "Childcare & school",
      kind: "service",
      blurb: "Help paying for daycare or after-school care while you work or study.",
      apply: { label: "Find your state's program", url: "https://childcare.gov/consumer-education/get-help-paying-for-child-care" },
      source: { label: "Childcare.gov", url: "https://childcare.gov/consumer-education/get-help-paying-for-child-care" },
      docs: ["Proof of work or school schedule", "Proof of income", "Children's birth certificates"],
      evaluate(ctx) {
        if (ctx.enrolled.childcare) return { status: "enrolled" };
        if (ctx.kidsUnder13 === 0) return { status: "unlikely", reasons: ["Child care help covers children under 13."] };
        if (!ctx.h.needsChildcare) return { status: "unlikely", reasons: ["You didn't say you need child care for work or school."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line. Federal rules allow up to 85% of state median income, but states set lower limits and many have waitlists.`];
        if (ctx.pct <= 200) return { status: "likely", reasons, valueLabel: "lower child care costs" };
        if (ctx.pct <= 300) return { status: "maybe", reasons, valueLabel: "lower child care costs" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "pell",
      name: "Pell Grant (college)",
      category: "Childcare & school",
      kind: "cash",
      blurb: "Free money for college that you don't pay back.",
      apply: { label: "Fill out the FAFSA", url: "https://studentaid.gov/h/apply-for-aid/fafsa" },
      source: { label: "Federal Student Aid: 2026–27 Pell amounts", url: "https://fsapartners.ed.gov/knowledge-center/library/dear-colleague-letters/2026-01-30/2026-27-federal-pell-grant-maximum-and-minimum-award-amounts" },
      docs: ["FAFSA", "Tax return or income info"],
      evaluate(ctx) {
        if (!ctx.h.student) return { status: "unlikely", reasons: ["No one is in or starting college."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line.`];
        if (ctx.pct <= 175 || (ctx.adults === 1 && ctx.children.length > 0 && ctx.pct <= 225)) {
          return { status: "likely", reasons: [...reasons, "Families at this income usually get the maximum award."], annual: D.pell.max, valueLabel: `up to ${money(D.pell.max)}/year` };
        }
        if (ctx.pct <= 400) return { status: "maybe", reasons: [...reasons, "You may get a partial Pell Grant. The FAFSA decides."], valueLabel: "partial grant possible" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "tanf",
      name: "TANF (cash assistance)",
      category: "Cash help",
      kind: "service",
      blurb: "Monthly cash for very low-income families with children.",
      apply: { label: "Find your state's TANF office", url: "https://www.acf.hhs.gov/ofa/map/about/help-families" },
      source: { label: "HHS TANF", url: "https://www.acf.hhs.gov/ofa/programs/tanf" },
      docs: ["Photo ID", "Children's birth certificates", "Proof of income"],
      evaluate(ctx) {
        if (ctx.onTanf) return { status: "enrolled" };
        if (ctx.kidsUnder19 === 0 && !ctx.h.pregnant) return { status: "unlikely", reasons: ["TANF is for families with children or pregnant people."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line. Each state sets its own limit, usually well below 100%.`];
        if (ctx.pct <= 50) return { status: "maybe", reasons, valueLabel: "monthly cash (amount set by your state)" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "ssi",
      name: "SSI (Supplemental Security Income)",
      category: "Cash help",
      kind: "cash",
      blurb: "Monthly cash for people 65+ or with disabilities who have little income.",
      apply: { label: "Apply for SSI", url: "https://www.ssa.gov/ssi" },
      source: { label: "SSA 2026 SSI amounts", url: "https://www.ssa.gov/oact/cola/SSI.html" },
      docs: ["Photo ID", "Medical records (for disability)", "Bank statements"],
      evaluate(ctx) {
        if (ctx.onSsi) return { status: "enrolled" };
        if (!ctx.elderlyOrDisabled) return { status: "unlikely", reasons: ["SSI is for people 65+ or with a disability."] };
        const fbr = D.ssi.individual;
        const countable = Math.max(0, ctx.otherMonthly - 20) + Math.max(0, (ctx.earnedMonthly - 65) / 2);
        const est = Math.max(0, fbr - countable);
        const reasons = [
          `The 2026 federal SSI payment is ${money(fbr)}/month, reduced by countable income.`,
          `Savings and assets must be under ${money(D.ssi.assetLimit)} (your home and one car don't count).`,
        ];
        if (est > 0) return { status: "maybe", reasons, annual: est * 12, valueLabel: `up to about ${money(est)}/month` };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "housing",
      name: "Housing Choice Voucher (Section 8) / public housing",
      category: "Housing",
      kind: "service",
      blurb: "Rent help so you pay about 30% of your income. Waitlists are long, so get on them early.",
      apply: { label: "Find your local housing authority", url: "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts" },
      source: { label: "HUD rental assistance", url: "https://www.hud.gov/topics/rental_assistance" },
      docs: ["Photo IDs", "Proof of income", "Birth certificates for everyone"],
      evaluate(ctx) {
        if (ctx.enrolled.housing) return { status: "enrolled" };
        if (ctx.h.housing === "own") return { status: "unlikely", reasons: ["Rental assistance is for renters or people without housing."] };
        const reasons = [`Your income is ${pctStr(ctx.pct)} of the poverty line. Vouchers go to households under 50% of local median income, which is usually well above the poverty line.`];
        if (ctx.h.housing === "homeless") reasons.push("Experiencing homelessness? Call 211 for emergency shelter and rapid rehousing.");
        if (ctx.pct <= 200) return { status: "maybe", reasons, valueLabel: "rent capped near 30% of income" };
        return { status: "unlikely", reasons };
      },
    },
    {
      id: "unclaimed",
      name: "Unclaimed money held by your state",
      category: "Cash help",
      kind: "service",
      blurb: "About 1 in 7 people have forgotten money (old paychecks, deposits, refunds) waiting for them.",
      apply: { label: "Search your state's official site", url: "https://unclaimed.org/" },
      source: { label: "NAUPA (unclaimed.org)", url: "https://unclaimed.org/" },
      docs: ["Photo ID", "Proof of past address"],
      evaluate() {
        return { status: "maybe", reasons: ["Anyone can have unclaimed property. It's free to search; never pay a \"finder\" service."], valueLabel: "free 2-minute search" };
      },
    },
  ];

  const ORDER = { likely: 0, maybe: 1, enrolled: 2, unlikely: 3 };

  function screen(household) {
    const ctx = buildContext(household);
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
      };
    }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.annual - a.annual);

    const likelyCash = results.filter((r) => r.status === "likely" && r.annual > 0);
    const maybeCash = results.filter((r) => r.status === "maybe" && r.annual > 0);
    return {
      ctx: { size: ctx.size, pct: ctx.pct, fplAnnual: ctx.fplAnnual, grossAnnual: ctx.grossAnnual },
      results,
      totals: {
        likelyAnnual: likelyCash.reduce((s, r) => s + r.annual, 0),
        maybeAnnual: maybeCash.reduce((s, r) => s + r.annual, 0),
        likelyCount: results.filter((r) => r.status === "likely").length,
        maybeCount: results.filter((r) => r.status === "maybe").length,
      },
    };
  }

  const API = { screen, buildContext, snapMonthly, eitcAmount, ctcRefundable, PROGRAMS };
  root.Claimable = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
