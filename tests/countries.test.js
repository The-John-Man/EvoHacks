const test = require("node:test");
const assert = require("node:assert/strict");

const US = require("../js/rules.js");
const CA = require("../js/countries/ca-rules.js");
const MX = require("../js/countries/mx-rules.js");
const Countries = require("../js/countries.js");

test("normalizeCountry accepts US CA MX aliases", () => {
  assert.equal(Countries.normalizeCountry("us"), "US");
  assert.equal(Countries.normalizeCountry("Canada"), "CA");
  assert.equal(Countries.normalizeCountry("méxico"), "MX");
  assert.equal(Countries.normalizeCountry("ZZ"), null);
});

test("CA MX and invalid country never route to U.S. rules", () => {
  assert.equal(Countries.routesToUS("CA"), false);
  assert.equal(Countries.routesToUS("MX"), false);
  assert.equal(Countries.routesToUS("XX"), false);
  assert.equal(Countries.routesToUS("US"), true);
});

test("dispatcher rejects unsupported country", () => {
  assert.throws(() => Countries.screen("ZZ", {}), (e) => e.code === "UNSUPPORTED_COUNTRY");
});

test("dispatcher US path still returns snap for Maria-like household", () => {
  const h = {
    state: "TX", adults: 1, seniors: 0, adultWorkingAge: true, children: [3, 8],
    earnedMonthly: 2100, otherMonthly: 0, rentMonthly: 1100, utilitiesMonthly: 180,
    housing: "rent", insurance: "none", paysEnergy: true, enrolled: {},
  };
  const res = Countries.screen("US", h);
  assert.equal(res.country, "US");
  assert.equal(res.results.find((r) => r.id === "snap").status, "likely");
  assert.equal(US.screen(h).results.find((r) => r.id === "snap").status, "likely");
});

test("Canada CCB: Aisha likely with estimate; age 18 child excluded", () => {
  const h = {
    province: "ON", adults: 1, applicantAge: 34, children: [4, 9],
    primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen",
    legalStatusOk: true, afniAnnual: 32000, afniUnknown: false, enrolled: {},
  };
  const res = CA.screen(h);
  const ccb = res.results.find((r) => r.id === "ca-ccb");
  assert.equal(ccb.status, "likely");
  assert.ok(ccb.annual > 10000);
  assert.equal(ccb.annual, 14745);

  const adultChild = CA.screen({ ...h, children: [18] });
  assert.equal(adultChild.results.find((r) => r.id === "ca-ccb").status, "unlikely");
});

test("Canada CCB shared custody halves estimate", () => {
  const base = {
    province: "QC", adults: 1, applicantAge: 38, children: [7],
    primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen",
    legalStatusOk: true, afniAnnual: 30000, afniUnknown: false, enrolled: {},
  };
  const full = CA.ccbAnnual([7], 30000, false).annual;
  const half = CA.ccbAnnual([7], 30000, true).annual;
  assert.equal(half, Math.round(full / 2));
  assert.equal(CA.screen({ ...base, sharedCustody: true }).results.find((r) => r.id === "ca-ccb").annual, half);
});

test("Canada OAS boundary ages and residence", () => {
  const senior = {
    province: "BC", adults: 1, applicantAge: 65, children: [],
    taxResident: true, legalStatusOk: true, yearsInCanadaAfter18: 40,
    afniAnnual: 0, afniUnknown: false, enrolled: {},
  };
  assert.equal(CA.screen(senior).results.find((r) => r.id === "ca-oas").status, "likely");
  assert.equal(CA.screen({ ...senior, applicantAge: 64 }).results.find((r) => r.id === "ca-oas").status, "unlikely");
  assert.equal(CA.screen({ ...senior, yearsInCanadaAfter18: null, yearsUnknown: true }).results.find((r) => r.id === "ca-oas").status, "maybe");
});

test("Canada unknown AFNI is maybe not zero-income likely for CCB", () => {
  const h = {
    province: "ON", adults: 1, applicantAge: 30, children: [2],
    primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen",
    legalStatusOk: true, afniAnnual: null, afniUnknown: true, enrolled: {},
  };
  assert.equal(CA.screen(h).results.find((r) => r.id === "ca-ccb").status, "maybe");
});

test("Mexico pension 65 boundary and nationality", () => {
  const base = {
    entity: "CMX", adults: 1, applicantAge: 65, gender: "female",
    mexicanNational: true, residesInMexico: true, children: [], enrolled: {},
  };
  const ok = MX.screen(base).results.find((r) => r.id === "mx-pension-65");
  assert.equal(ok.status, "likely");
  assert.equal(ok.annual, 6400 * 6);
  assert.equal(MX.screen({ ...base, applicantAge: 64 }).results.find((r) => r.id === "mx-pension-65").status, "unlikely");
  assert.equal(MX.screen({ ...base, mexicanNational: false }).results.find((r) => r.id === "mx-pension-65").status, "unlikely");
});

test("Mexico Mujeres Bienestar age window", () => {
  const base = {
    entity: "JAL", adults: 1, applicantAge: 62, gender: "female",
    mexicanNational: true, residesInMexico: true, children: [], enrolled: {},
  };
  assert.equal(MX.screen(base).results.find((r) => r.id === "mx-mujeres").status, "likely");
  assert.equal(MX.screen({ ...base, applicantAge: 59 }).results.find((r) => r.id === "mx-mujeres").status, "unlikely");
  assert.equal(MX.screen({ ...base, applicantAge: 65 }).results.find((r) => r.id === "mx-mujeres").status, "unlikely");
  assert.equal(MX.screen({ ...base, gender: "male" }).results.find((r) => r.id === "mx-mujeres").status, "unlikely");
});

test("Countries.screen CA/MX never call into US PROGRAM ids", () => {
  const ca = Countries.screen("CA", {
    province: "ON", adults: 1, applicantAge: 34, children: [4],
    primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen",
    legalStatusOk: true, afniAnnual: 20000, enrolled: {},
  });
  assert.ok(ca.results.every((r) => r.id.startsWith("ca-")));
  const mx = Countries.screen("MX", {
    entity: "CMX", adults: 1, applicantAge: 70, mexicanNational: true,
    residesInMexico: true, children: [], enrolled: {},
  });
  assert.ok(mx.results.every((r) => r.id.startsWith("mx-")));
});
