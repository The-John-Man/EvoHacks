(function (root) {
  "use strict";

  const DATA = {
    asOf: "November 2026",

    fpl: {
      contiguous: { base: 15960, perPerson: 5680 },
      AK: { base: 19950, perPerson: 7100 },
      HI: { base: 18360, perPerson: 6530 },
    },

    snap: {
      maxAllotment: [306, 562, 808, 1023, 1217, 1463, 1616, 1841],
      maxAllotmentPerExtra: 225,
      standardDeduction: { 1: 217, 2: 217, 3: 217, 4: 229, 5: 268, 6: 308 },
      maxExcessShelter: 769,
      earnedIncomeDeduction: 0.2,
      minimumBenefit: 24,
    },

    eitc: {
      byKids: [
        { max: 664, phaseInRate: 0.0765, phaseOutRate: 0.0765, phaseOutStart: 10860 },
        { max: 4427, phaseInRate: 0.34, phaseOutRate: 0.1598, phaseOutStart: 23890 },
        { max: 7316, phaseInRate: 0.4, phaseOutRate: 0.2106, phaseOutStart: 23890 },
        { max: 8231, phaseInRate: 0.45, phaseOutRate: 0.2106, phaseOutStart: 23890 },
      ],
      marriedBump: 7270,
      investmentIncomeLimit: 12200,
    },

    ctc: { perChild: 2200, refundablePerChild: 1700, earnedThreshold: 2500, phaseInRate: 0.15 },

    nonExpansionStates: ["AL", "FL", "GA", "KS", "MS", "SC", "TN", "TX", "WI", "WY"],

    sunBucksOptOut: ["AK", "FL", "GA", "ID", "IN", "MO", "OK", "SC", "SD", "TN", "TX", "WY"],
    sunBucksPerChild: 120,

    ssi: { individual: 994, couple: 1491, assetLimit: 2000 },

    lifeline: { monthly: 9.25, fplPercent: 135 },

    pell: { max: 7395 },

    estimates: {
      wicPerPersonMonthly: 55,
      schoolMealsFreePerChildYear: 1200,
      schoolMealsReducedPerChildYear: 1000,
      liheapYear: 500,
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

  DATA.fplFor = function (size, state) {
    const t = DATA.fpl[state] || DATA.fpl.contiguous;
    const n = Math.max(1, size);
    return t.base + t.perPerson * (n - 1);
  };

  root.ClaimableData = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);
