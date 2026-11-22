// Run with:  node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../js/data.js");
const C = require("../js/rules.js");

const base = (over = {}) => ({
  state: "TX", adults: 1, seniors: 0, adultWorkingAge: true, children: [],
  earnedMonthly: 0, otherMonthly: 0, rentMonthly: 0, utilitiesMonthly: 0,
  housing: "rent", insurance: "none", paysEnergy: true, enrolled: {}, ...over,
});
const find = (res, id) => res.results.find((r) => r.id === id);

test("poverty guideline matches 2026 HHS table", () => {
  assert.equal(D.fplFor(1, "TX"), 15960);
  assert.equal(D.fplFor(4, "OH"), 33000);
  assert.equal(D.fplFor(8, "CA"), 55720);
  assert.equal(D.fplFor(9, "CA"), 61400);
});

test("Maria: single mom, 2 kids, $2,100/mo in Texas", () => {
  const h = base({ children: [3, 8], earnedMonthly: 2100, rentMonthly: 1100, utilitiesMonthly: 180 });
  const ctx = C.buildContext(h);
  assert.equal(ctx.size, 3);
  assert.equal(Math.round(ctx.pct), 92);

  // SNAP: 808 - 0.3 * (2100 - 420 - 217 - (1280 - 731.5)) = 533.65
  assert.equal(C.snapMonthly(ctx).benefit, 534);
  // EITC (2 kids): max 7316, minus 21.06% of (25,200 - 23,890)
  assert.equal(C.eitcAmount(ctx), 7040);
  // CTC refundable: min(2 * 1700, 15% of (25,200 - 2,500))
  assert.equal(C.ctcRefundable(ctx), 3400);

  const res = C.screen(h);
  assert.equal(find(res, "snap").status, "likely");
  assert.equal(find(res, "wic").status, "likely"); // child age 3
  assert.equal(find(res, "school-meals").status, "likely");
  assert.equal(find(res, "medicaid-adult").status, "unlikely"); // Texas didn't expand
  assert.equal(find(res, "medicaid-kids").status, "likely");
  assert.equal(find(res, "marketplace").status, "unlikely"); // 92% in a non-expansion state = coverage gap
  assert.equal(find(res, "sun-bucks").status, "unlikely"); // Texas opted out in 2026
  assert.ok(res.totals.likelyAnnual > 15000);
});

test("SNAP gross income test", () => {
  // 1 person at $1,800/mo is above 130% ($1,729) and gets "maybe" (state may use 200%)
  // (with $1,000 rent the formula still gives a benefit: 306 - 0.3 * 834.5 = 56)
  const r = C.screen(base({ earnedMonthly: 1800, rentMonthly: 1000 }));
  assert.equal(find(r, "snap").status, "maybe");
  // same income with no housing costs: formula gives $0, so unlikely
  assert.equal(find(C.screen(base({ earnedMonthly: 1800 })), "snap").status, "unlikely");
  // well above 200%: unlikely
  assert.equal(find(C.screen(base({ earnedMonthly: 4000 })), "snap").status, "unlikely");
  // seniors skip the gross test and get an uncapped shelter deduction:
  // 1083 adjusted, 658.5 excess shelter, net 424.5, 306 - 127.35 = 179
  const s = C.screen(base({ seniors: 1, otherMonthly: 1300, rentMonthly: 1200, adultWorkingAge: false }));
  assert.equal(find(s, "snap").status, "likely");
  assert.equal(find(s, "snap").annual, 179 * 12);
});

test("SNAP minimum benefit for small households", () => {
  const ctx = C.buildContext(base({ earnedMonthly: 1500 }));
  const b = C.snapMonthly(ctx).benefit;
  assert.ok(b === 0 || b >= D.snap.minimumBenefit);
});

test("already-enrolled programs are marked enrolled, not counted", () => {
  const r = C.screen(base({ children: [2], earnedMonthly: 1500, enrolled: { snap: true, wic: true } }));
  assert.equal(find(r, "snap").status, "enrolled");
  assert.equal(find(r, "wic").status, "enrolled");
  assert.equal(find(r, "snap").annual, 0);
});

test("SNAP or Medicaid makes WIC and Lifeline automatic, regardless of income", () => {
  const r = C.screen(base({ children: [1], earnedMonthly: 5000, enrolled: { medicaid: true } }));
  assert.equal(find(r, "wic").status, "likely");
  assert.equal(find(r, "lifeline").status, "likely");
});

test("EITC rules", () => {
  // no earnings: no EITC
  assert.equal(C.eitcAmount(C.buildContext(base())), 0);
  // childless worker under 25: no EITC
  assert.equal(C.eitcAmount(C.buildContext(base({ earnedMonthly: 800, adultWorkingAge: false }))), 0);
  // childless worker at $8,680/yr hits the $664 max
  assert.equal(C.eitcAmount(C.buildContext(base({ earnedMonthly: 8680 / 12 }))), 664);
  // investment income over the limit blocks it
  assert.equal(C.eitcAmount(C.buildContext(base({ children: [5], earnedMonthly: 1500, investmentOver: true }))), 0);
  // married couples get extra phase-out room
  const single = C.eitcAmount(C.buildContext(base({ children: [5], earnedMonthly: 3000 })));
  const married = C.eitcAmount(C.buildContext(base({ adults: 2, married: true, children: [5], earnedMonthly: 3000 })));
  assert.ok(married > single);
  // 1 child, income above the published $51,593 limit: zero
  assert.equal(C.eitcAmount(C.buildContext(base({ children: [5], earnedMonthly: 52000 / 12 }))), 0);
});

test("Medicaid expansion vs non-expansion", () => {
  const low = { earnedMonthly: 1200 }; // ~90% FPL for 1 person
  assert.equal(find(C.screen(base({ ...low, state: "OH" })), "medicaid-adult").status, "likely");
  assert.equal(find(C.screen(base({ ...low, state: "TX" })), "medicaid-adult").status, "unlikely");
  // pregnancy opens Medicaid even in non-expansion states
  assert.equal(find(C.screen(base({ ...low, state: "TX", pregnant: true })), "medicaid-adult").status, "likely");
});

test("Dorothy: senior on Social Security with medical bills", () => {
  const r = C.screen(base({ state: "FL", seniors: 1, adultWorkingAge: false, otherMonthly: 1150, housing: "own", insurance: "other", medicalBills: true, utilitiesMonthly: 210 }));
  assert.equal(find(r, "ssi").status, "unlikely"); // $1,150 - $20 countable > $994
  assert.equal(find(r, "charity-care").status, "likely");
  assert.equal(find(r, "liheap").status, "likely");
  assert.equal(find(r, "housing").status, "unlikely"); // homeowner
  assert.equal(find(r, "eitc").status, "unlikely"); // no earned income
});

test("SSI estimate for a disabled adult with small income", () => {
  const r = C.screen(base({ disabled: true, otherMonthly: 400 }));
  const ssi = find(r, "ssi");
  assert.equal(ssi.status, "maybe");
  assert.equal(ssi.annual, (994 - 380) * 12);
});

test("every program returns a valid result for an empty household", () => {
  const r = C.screen(base());
  assert.equal(r.results.length, C.PROGRAMS.length);
  for (const x of r.results) {
    assert.ok(["likely", "maybe", "enrolled", "unlikely"].includes(x.status), x.id);
    assert.ok(x.apply.url.startsWith("https://"), x.id);
    assert.ok(x.source.url.startsWith("https://"), x.id);
    assert.ok(Number.isFinite(x.annual), x.id);
  }
});

test("results are sorted likely > maybe > enrolled > unlikely", () => {
  const order = { likely: 0, maybe: 1, enrolled: 2, unlikely: 3 };
  const r = C.screen(base({ children: [2, 9], earnedMonthly: 1900, enrolled: { lifeline: true } }));
  for (let i = 1; i < r.results.length; i++) {
    assert.ok(order[r.results[i - 1].status] <= order[r.results[i].status]);
  }
});
