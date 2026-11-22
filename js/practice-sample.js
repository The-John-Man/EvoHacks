/* The only values offered for autofill in the fictional Maria demo. */
(function () {
  const sample = Object.freeze({ householdSize: 3, rentMonthly: 1100, utilitiesMonthly: 180 });
  if (typeof module !== "undefined" && module.exports) module.exports = sample;
  else window.ClaimableSample = sample;
})();
