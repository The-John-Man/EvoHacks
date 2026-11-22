(function (root) {
  "use strict";

  const US = root.Claimable;
  const CA = root.ClaimableCA;
  const MX = root.ClaimableMX;

  function normalizeCountry(code) {
    const c = String(code || "").trim().toUpperCase();
    if (c === "US" || c === "USA" || c === "UNITED STATES") return "US";
    if (c === "CA" || c === "CAN" || c === "CANADA") return "CA";
    if (c === "MX" || c === "MEX" || c === "MEXICO" || c === "MÉXICO") return "MX";
    return null;
  }

  function screen(country, household) {
    const code = normalizeCountry(country);
    if (!code) {
      const err = new Error("Unsupported country");
      err.code = "UNSUPPORTED_COUNTRY";
      throw err;
    }
    if (code === "US") {
      if (!US || typeof US.screen !== "function") throw new Error("U.S. engine missing");
      const out = US.screen(household);
      out.country = "US";
      out.currency = out.currency || "USD";
      (out.results || []).forEach((r) => {
        if (!r.currency) r.currency = "USD";
      });
      return out;
    }
    if (code === "CA") {
      if (!CA || typeof CA.screen !== "function") throw new Error("Canada engine missing");
      return CA.screen(household);
    }
    if (code === "MX") {
      if (!MX || typeof MX.screen !== "function") throw new Error("Mexico engine missing");
      return MX.screen(household);
    }
    const err = new Error("Unsupported country");
    err.code = "UNSUPPORTED_COUNTRY";
    throw err;
  }

  function routesToUS(country) {
    return normalizeCountry(country) === "US";
  }

  const API = {
    screen,
    normalizeCountry,
    routesToUS,
    supported: ["US", "CA", "MX"],
    programCounts: { US: 20, CA: 5, MX: 6 },
  };
  root.ClaimableCountries = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
