(function (root) {
  "use strict";

  const DATA = {
    asOf: "November 2026",
    currency: "CAD",
    provinces: [
      ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"],
      ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"],
      ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"],
      ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
      ["SK", "Saskatchewan"], ["YT", "Yukon"],
    ],
    ccb: {
      benefitYear: "July 2025 – June 2026",
      afniTaxYear: 2024,
      under6: 7997,
      ages6to17: 6748,
      threshold1: 37487,
      threshold2: 81222,
      phase1Rate: { 1: 0.07, 2: 0.135, 3: 0.19, 4: 0.23 },
      phase2Fixed: { 1: 3061, 2: 5904, 3: 8310, 4: 10059 },
      phase2Rate: { 1: 0.032, 2: 0.057, 3: 0.08, 4: 0.095 },
      source: {
        label: "CRA CCB calculation sheet (2025–26)",
        url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit/canada-child-benefit-ccb-calculation-sheet-july-2025-june-2026-payments-2024-tax-year.html",
        effectivePeriod: "2025-07-01/2026-06-30",
      },
    },
    oas: {
      monthly65to74: 740.09,
      monthly75plus: 814.1,
      clawbackStart: 93454,
      minResidenceYears: 10,
      fullResidenceYears: 40,
      source: {
        label: "ESDC OAS quarterly amounts (Oct–Dec 2025)",
        url: "https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2025-quarterly-october-december.html",
        effectivePeriod: "2025-10-01/2025-12-31",
      },
    },
    gis: {
      singleMaxMonthly: 1105.43,
      singleCutoff: 22440,
      coupleBothOasMaxMonthly: 665.41,
      coupleBothOasCutoff: 29616,
      source: {
        label: "ESDC GIS quarterly amounts (Oct–Dec 2025)",
        url: "https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2025-quarterly-october-december.html",
        effectivePeriod: "2025-10-01/2025-12-31",
      },
    },
    cdb: {
      maxMonthly: 200,
      note: "Payment amount depends on Disability Tax Credit approval and income; agency calculates exact entitlement.",
      source: {
        label: "Canada Disability Benefit overview",
        url: "https://www.canada.ca/en/services/benefits/disability/canada-disability-benefit.html",
        effectivePeriod: "2025-07-01/2026-12-31",
      },
    },
    cdcp: {
      incomeLimit: 90000,
      source: {
        label: "Canadian Dental Care Plan",
        url: "https://www.canada.ca/en/services/benefits/dental/dental-care-plan.html",
        effectivePeriod: "2025-01-01/2026-12-31",
      },
    },
  };

  root.ClaimableCAData = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);
