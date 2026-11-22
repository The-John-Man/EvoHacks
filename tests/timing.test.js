// Run with:  node --test tests/rules.test.js tests/auth.test.js tests/timing.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/rules.js");
const T = require("../js/timing.js");

const NOV_21_2026 = new Date(2026, 10, 21);
const base = (over = {}) => ({
  state: "TX", adults: 1, seniors: 0, adultWorkingAge: true, children: [],
  earnedMonthly: 0, otherMonthly: 0, rentMonthly: 0, utilitiesMonthly: 0,
  housing: "rent", insurance: "none", paysEnergy: true, enrolled: {}, ...over,
});
const timed = (h, today = NOV_21_2026) => T.addTiming(C.screen(h).results, h, today);
const find = (rs, id) => rs.find((r) => r.id === id);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

test("every program has a timing estimator", () => {
  for (const p of C.PROGRAMS) assert.ok(T.ESTIMATORS[p.id], `missing estimator for ${p.id}`);
});

test("bucket boundaries", () => {
  assert.equal(T.bucketOf(0), "week");
  assert.equal(T.bucketOf(7), "week");
  assert.equal(T.bucketOf(8), "month");
  assert.equal(T.bucketOf(31), "month");
  assert.equal(T.bucketOf(92), "quarter");
  assert.equal(T.bucketOf(93), "longer");
});

test("tax refunds with EITC/CTC follow the PATH Act calendar", () => {
  const nov = T.taxRefundWindow(NOV_21_2026);
  assert.ok(sameDay(nov.early, new Date(2027, 2, 1)));
  assert.equal(nov.label, "Early March 2027");
  const jan = T.taxRefundWindow(new Date(2027, 0, 10));
  assert.ok(sameDay(jan.early, new Date(2027, 2, 1)));
  const april = T.taxRefundWindow(new Date(2027, 3, 1));
  assert.ok(sameDay(april.early, new Date(2027, 3, 22)), "after the hold: ~21 days");
});

test("marketplace coverage start dates around open enrollment", () => {
  assert.ok(sameDay(T.marketplaceStart(NOV_21_2026).start, new Date(2027, 0, 1)));
  assert.ok(sameDay(T.marketplaceStart(new Date(2026, 11, 15)).start, new Date(2027, 0, 1)));
  assert.ok(sameDay(T.marketplaceStart(new Date(2026, 11, 20)).start, new Date(2027, 1, 1)));
  assert.ok(sameDay(T.marketplaceStart(new Date(2027, 0, 10)).start, new Date(2027, 1, 1)));
  const march = T.marketplaceStart(new Date(2027, 2, 3));
  assert.equal(march.inOpenEnrollment, false);
  assert.ok(sameDay(march.start, new Date(2027, 3, 1)));
});

test("SUN Bucks arrive next summer", () => {
  assert.ok(sameDay(T.nextSummer(NOV_21_2026).start, new Date(2027, 5, 1)));
  assert.ok(sameDay(T.nextSummer(new Date(2027, 2, 1)).start, new Date(2027, 5, 1)));
});

test("SNAP: 30 days normally, 7 days when expedited", () => {
  // Maria: $2,100 income, $1,280 rent + utilities -> normal 30-day processing
  const maria = find(timed(base({ children: [3, 8], earnedMonthly: 2100, rentMonthly: 1100, utilitiesMonthly: 180 })), "snap");
  assert.equal(maria.timing.maxDays, 30);
  assert.equal(maria.timing.bucket, "month");
  assert.equal(maria.timing.basis, "law");
  // No income -> expedited
  const none = find(timed(base({ rentMonthly: 600 })), "snap");
  assert.equal(none.timing.maxDays, 7);
  assert.equal(none.timing.bucket, "week");
  // Rent + utilities above income -> expedited
  const rentHeavy = find(timed(base({ earnedMonthly: 900, rentMonthly: 850, utilitiesMonthly: 120 })), "snap");
  assert.equal(rentHeavy.timing.maxDays, 7);
});

test("WIC: 10 days for pregnancy or infants, 20 otherwise", () => {
  assert.equal(find(timed(base({ pregnant: true, earnedMonthly: 1200 })), "wic").timing.maxDays, 10);
  assert.equal(find(timed(base({ children: [0], earnedMonthly: 1200 })), "wic").timing.maxDays, 10);
  assert.equal(find(timed(base({ children: [3], earnedMonthly: 1200 })), "wic").timing.maxDays, 20);
});

test("LIHEAP crisis help within 48 hours when behind on bills", () => {
  const crisis = find(timed(base({ earnedMonthly: 1000, behindUtilities: true })), "liheap");
  assert.equal(crisis.timing.maxDays, 2);
  assert.equal(crisis.timing.bucket, "week");
  const regular = find(timed(base({ earnedMonthly: 1000 })), "liheap");
  assert.equal(regular.timing.bucket, "quarter"); // "2–8 weeks": grouped by its upper end
});

test("Medicaid: 45 days, 90 with a disability, and the 2027 retroactive warning", () => {
  const oh = base({ state: "OH", earnedMonthly: 1000 });
  const adult = find(timed(oh), "medicaid-adult");
  assert.equal(adult.timing.maxDays, 45);
  assert.ok(adult.timing.speedUp.some((s) => s.includes("January 1, 2027")));
  const later = find(timed(oh, new Date(2027, 1, 1)), "medicaid-adult");
  assert.ok(!later.timing.speedUp.some((s) => s.includes("before January 1, 2027")));
  const dis = find(timed(base({ state: "OH", earnedMonthly: 1000, disabled: true })), "medicaid-adult");
  assert.equal(dis.timing.maxDays, 90);
});

test("tax credits for Maria land in early March 2027", () => {
  const rs = timed(base({ children: [3, 8], earnedMonthly: 2100, rentMonthly: 1100, utilitiesMonthly: 180 }));
  const eitc = find(rs, "eitc");
  assert.equal(eitc.timing.label, "Early March 2027");
  assert.equal(eitc.timing.bucket, "longer");
  assert.equal(eitc.timing.minDays, 100); // Nov 21, 2026 -> Mar 1, 2027
});

test("only likely/maybe results get timing", () => {
  const rs = timed(base({ children: [2], earnedMonthly: 1500, enrolled: { snap: true } }));
  assert.equal(find(rs, "snap").timing, null); // enrolled
  for (const r of rs) {
    if (r.status === "unlikely" || r.status === "enrolled") assert.equal(r.timing, null, r.id);
    else assert.ok(r.timing && Number.isFinite(r.timing.maxDays) && r.timing.label, r.id);
  }
});

// ---------- Per-program application timelines ----------

const NOV_22_2026 = new Date(2026, 10, 22);
const maria = base({ children: [3, 8], earnedMonthly: 2100, rentMonthly: 1100, utilitiesMonthly: 180 });
const stepOf = (tl, key) => tl.steps.find((s) => s.key === key);

test("every U.S. program has a step plan", () => {
  for (const p of C.PROGRAMS) assert.ok(T.PLANS[p.id], `missing plan for ${p.id}`);
});

test("before applying: dates are estimates from today", () => {
  const tl = T.buildTimeline("snap", maria, {}, NOV_22_2026);
  assert.equal(tl.estimated, true);
  assert.equal(stepOf(tl, "apply").status, "now");
  assert.ok(tl.steps.filter((s) => s.key !== "apply").every((s) => s.status === "planned"));
  assert.ok(sameDay(tl.arrival.to, new Date(2026, 11, 22))); // today + 30 days
});

test("after applying: statuses follow the calendar", () => {
  const tl = T.buildTimeline("snap", maria, { appliedOn: "2026-11-01" }, NOV_22_2026);
  assert.equal(tl.estimated, false);
  assert.equal(stepOf(tl, "apply").status, "done");
  assert.equal(stepOf(tl, "interview").status, "late");     // Nov 4–15 has passed, not marked
  assert.equal(stepOf(tl, "docs").status, "now");           // Nov 6–25
  assert.equal(stepOf(tl, "aid").status, "now");            // Nov 11 – Dec 1
  assert.equal(stepOf(tl, "renew").status, "upcoming");
  assert.ok(sameDay(tl.arrival.to, new Date(2026, 11, 1)));
  assert.equal(tl.next.key, "docs");
});

test("checking off steps, and overdue steps you owe", () => {
  const done = T.buildTimeline("snap", maria, { appliedOn: "2026-11-01", done: { interview: true, aid: true } }, NOV_22_2026);
  assert.equal(stepOf(done, "interview").status, "done");
  assert.equal(done.arrival.received, true);
  const old = T.buildTimeline("snap", maria, { appliedOn: "2026-10-01" }, NOV_22_2026);
  assert.equal(stepOf(old, "docs").status, "overdue");       // Oct 6–25, nothing sent
  assert.equal(old.next.key, "docs");
  assert.equal(old.arrival.late, true);
});

test("your updates appear on the timeline in date order", () => {
  const tl = T.buildTimeline("snap", maria, {
    appliedOn: "2026-11-01",
    notes: [{ date: "2026-11-20", text: "Sent pay stubs" }, { date: "2026-11-10", text: "Interview done" }, { date: "2026-11-12", text: "  " }],
  }, NOV_22_2026);
  const notes = tl.items.filter((i) => i.type === "note");
  assert.deepEqual(notes.map((n) => n.text), ["Interview done", "Sent pay stubs"]); // blank note dropped
  for (let i = 1; i < tl.items.length; i++) assert.ok(tl.items[i - 1].sortDate <= tl.items[i].sortDate);
});

test("programs without researched timing get an undated timeline", () => {
  const tl = T.buildTimeline("CA:ca-ccb", null, { appliedOn: "2026-11-15" }, NOV_22_2026, { source: { label: "CRA", url: "https://www.canada.ca/" } });
  assert.equal(tl.summary.basis, "unknown");
  assert.equal(tl.steps.length, 3);
  assert.equal(stepOf(tl, "apply").status, "done");
  assert.equal(stepOf(tl, "docs").from, null);
  assert.equal(stepOf(tl, "aid").status, "upcoming"); // never "late" without a real date
  assert.equal(tl.summary.source.label, "CRA");
});

test("Medicaid: 2027 work reporting and 6-month renewals for expansion adults", () => {
  const oh = base({ state: "OH", earnedMonthly: 1000 });
  const tl = T.buildTimeline("medicaid-adult", oh, { appliedOn: "2026-11-20" }, NOV_22_2026);
  const work = stepOf(tl, "work");
  assert.ok(work && sameDay(work.from, new Date(2027, 0, 1)));
  assert.match(stepOf(tl, "renew").title, /6 months/);
  // Parents of a child 13 or younger are exempt from work reporting.
  const parent = T.buildTimeline("medicaid-adult", base({ state: "OH", earnedMonthly: 1000, children: [5] }), { appliedOn: "2026-11-20" }, NOV_22_2026);
  assert.equal(stepOf(parent, "work"), undefined);
  // Non-expansion state: no work step, yearly renewal.
  const tx = T.buildTimeline("medicaid-adult", base({ state: "TX", earnedMonthly: 1000, pregnant: true }), { appliedOn: "2026-11-20" }, NOV_22_2026);
  assert.equal(stepOf(tx, "work"), undefined);
  assert.match(stepOf(tx, "renew").title, /Yearly/);
});

test("tax credits: filing date drives refund timing", () => {
  const before = T.buildTimeline("eitc", maria, {}, NOV_22_2026);
  assert.ok(sameDay(stepOf(before, "file").from, new Date(2027, 0, 26)));
  assert.ok(sameDay(before.arrival.from, new Date(2027, 2, 1)));
  const early = T.buildTimeline("eitc", maria, { appliedOn: "2027-02-01" }, new Date(2027, 1, 2));
  assert.ok(sameDay(early.arrival.from, new Date(2027, 2, 1)));  // PATH Act hold
  const late = T.buildTimeline("eitc", maria, { appliedOn: "2027-04-01" }, new Date(2027, 3, 2));
  assert.ok(sameDay(late.arrival.from, new Date(2027, 3, 22)));  // ~21 days
});

test("bad application dates are ignored", () => {
  const tl = T.buildTimeline("snap", maria, { appliedOn: "not-a-date" }, NOV_22_2026);
  assert.equal(tl.estimated, true);
});

test("tracking is saved per user and removed with their checklist", () => {
  const A = require("../js/auth.js");
  const m = new Map();
  const store = A.makeStore({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  store.saveTracking("u1", { snap: { appliedOn: "2026-11-01", notes: [{ date: "2026-11-10", text: "x" }] } });
  store.saveTracking("u2", { wic: { appliedOn: "2026-11-05" } });
  assert.equal(store.loadTracking("u1").snap.appliedOn, "2026-11-01");
  assert.deepEqual(store.loadTracking("nobody"), {});
  store.saveResults("u1", { state: "TX" });
  store.deleteResults("u1");
  assert.deepEqual(store.loadTracking("u1"), {});
  assert.equal(store.loadTracking("u2").wic.appliedOn, "2026-11-05");
});
