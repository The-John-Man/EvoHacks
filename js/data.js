/*
 * Claimable — reference data.
 * Every number here comes from a published government source (linked next to it).
 * When a figure is an estimate rather than an official number, it says so.
 * Update this file each year; the rules in rules.js read from it.
 */
(function (root) {
  "use strict";

  const DATA = {
    asOf: "November 2026",

    // 2026 HHS poverty guidelines (annual). Federal Register, Jan 15 2026.
    // https://www.federalregister.gov/documents/2026/01/15/2026-00755/annual-update-of-the-hhs-poverty-guidelines
    // Alaska/Hawaii base + increment derived from USDA's FY2027 SNAP 100% tables (approximate).
    fpl: {
      contiguous: { base: 15960, perPerson: 5680 },
      AK: { base: 19950, perPerson: 7100 },
      HI: { base: 18360, perPerson: 6530 },
    },

    // SNAP FY2027 (Oct 1 2026 – Sep 30 2027), 48 states + DC.
    // https://www.fns.usda.gov/snap/allotment/cola
    snap: {
      maxAllotment: [306, 562, 808, 1023, 1217, 1463, 1616, 1841],
      maxAllotmentPerExtra: 225,
      standardDeduction: { 1: 217, 2: 217, 3: 217, 4: 229, 5: 268, 6: 308 },
      maxExcessShelter: 769,
      earnedIncomeDeduction: 0.2,
      minimumBenefit: 24, // 1–2 person households (approximate)
    },

    // EITC, tax year 2026. IRS Rev. Proc. 2025-32 / IRS EITC page.
    // https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/eitc-income-limits-maximum-credit-amounts-and-tax-law-updates
    // Phase-in/phase-out rates are set in statute (26 U.S.C. §32). The phase-out start is
    // derived from the published maximum credit and income limits.
    eitc: {
      byKids: [
        { max: 664, phaseInRate: 0.0765, phaseOutRate: 0.0765, phaseOutStart: 10860 },
        { max: 4427, phaseInRate: 0.34, phaseOutRate: 0.1598, phaseOutStart: 23890 },
        { max: 7316, phaseInRate: 0.4, phaseOutRate: 0.2106, phaseOutStart: 23890 },
        { max: 8231, phaseInRate: 0.45, phaseOutRate: 0.2106, phaseOutStart: 23890 },
      ],
      marriedBump: 7270, // extra phase-out room for married filing jointly (approximate)
      investmentIncomeLimit: 12200,
    },

    // Child Tax Credit, tax year 2026 (OBBBA, indexed). https://www.irs.gov/credits-deductions/individuals/child-tax-credit
    ctc: { perChild: 2200, refundablePerChild: 1700, earnedThreshold: 2500, phaseInRate: 0.15 },

    // States that have NOT adopted ACA Medicaid expansion (KFF, 2026).
    // https://www.kff.org/affordable-care-act/state-indicator/state-activity-around-expanding-medicaid-under-the-affordable-care-act/
    nonExpansionStates: ["AL", "FL", "GA", "KS", "MS", "SC", "TN", "TX", "WI", "WY"],

    // States that did not run Summer EBT / SUN Bucks in 2026 (news reports; list may change).
    // https://www.fns.usda.gov/summer/sunbucks
    sunBucksOptOut: ["AK", "FL", "GA", "ID", "IN", "MO", "OK", "SC", "SD", "TN", "TX", "WY"],
    sunBucksPerChild: 120,

    // SSI federal benefit rate 2026. https://www.ssa.gov/oact/cola/SSI.html
    ssi: { individual: 994, couple: 1491, assetLimit: 2000 },

    // Lifeline phone/internet discount. https://www.fcc.gov/lifeline-consumers
    lifeline: { monthly: 9.25, fplPercent: 135 },

    // Pell Grant 2026–27. https://fsapartners.ed.gov/knowledge-center/library/dear-colleague-letters/2026-01-30/2026-27-federal-pell-grant-maximum-and-minimum-award-amounts
    pell: { max: 7395 },

    // Rough value estimates used only for the "money on the table" total. Labeled as estimates in the UI.
    estimates: {
      wicPerPersonMonthly: 55, // typical WIC food package value; formula packages are worth more
      schoolMealsFreePerChildYear: 1200, // ~180 school days of free breakfast + lunch at federal reimbursement rates
      schoolMealsReducedPerChildYear: 1000,
      liheapYear: 500, // average LIHEAP heating benefit; varies widely by state
    },

    states: [
      ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
      ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
      ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
      ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
      ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
      ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
      ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
      ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
      ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
      ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
      ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
    ],
  };

  /** Annual federal poverty guideline for a household size in a state. */
  DATA.fplFor = function (size, state) {
    const t = DATA.fpl[state] || DATA.fpl.contiguous;
    const n = Math.max(1, size);
    return t.base + t.perPerson * (n - 1);
  };

  root.ClaimableData = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);
