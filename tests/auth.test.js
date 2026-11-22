// Run with:  node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../js/auth.js");

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

const okResponse = {
  authenticated: true,
  oauth: { access_token: "tok", id_token: "id", expires_in: 3600 },
  user: { identifier: "pat@example.com", user_id: "u_123" },
};

test("parseLoginResponse accepts a successful MojoAuth response", () => {
  const s = A.parseLoginResponse(okResponse, 1000);
  assert.equal(s.userId, "u_123");
  assert.equal(s.email, "pat@example.com");
  assert.ok(s.expiresAt > 1000);
  assert.equal("accessToken" in s, false, "the token is not stored");
});

test("parseLoginResponse rejects failed or malformed responses", () => {
  assert.equal(A.parseLoginResponse(null), null);
  assert.equal(A.parseLoginResponse("nope"), null);
  assert.equal(A.parseLoginResponse({ authenticated: false, user: { user_id: "x" }, oauth: { access_token: "t" } }), null);
  assert.equal(A.parseLoginResponse({ user: { user_id: "x" } }), null); // no token
  assert.equal(A.parseLoginResponse({ oauth: { access_token: "t" }, user: {} }), null); // no user
});

test("falls back to the email as the user id", () => {
  const s = A.parseLoginResponse({ oauth: { access_token: "t" }, user: { identifier: "a@b.co" } });
  assert.equal(s.userId, "a@b.co");
});

test("session expires", () => {
  const store = A.makeStore(fakeStorage());
  const s = A.parseLoginResponse(okResponse, 0);
  store.setSession(s);
  assert.equal(store.getSession(1).userId, "u_123");
  assert.equal(store.getSession(s.expiresAt + 1), null);
  store.clearSession();
  assert.equal(store.getSession(1), null);
});

test("saved checklists are kept per user and can be deleted", () => {
  const store = A.makeStore(fakeStorage());
  store.saveResults("u1", { state: "TX" }, 5);
  store.saveResults("u2", { state: "OH" }, 6);
  assert.deepEqual(store.loadResults("u1"), { answers: { state: "TX" }, savedAt: 5 });
  assert.equal(store.loadResults("u2").answers.state, "OH");
  store.deleteResults("u1");
  assert.equal(store.loadResults("u1"), null);
  assert.equal(store.loadResults("u2").answers.state, "OH");
});

test("blocked or broken storage never throws", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const store = A.makeStore(broken);
  assert.equal(store.getSession(), null);
  assert.equal(store.setSession({ userId: "x", expiresAt: Infinity }), false);
  assert.equal(store.saveResults("x", {}), false);
  assert.doesNotThrow(() => store.clearSession());
  const none = A.makeStore(null);
  assert.equal(none.loadResults("x"), null);
});

test("corrupted saved data is ignored", () => {
  const s = fakeStorage();
  s.setItem(A.SESSION_KEY, "{not json");
  assert.equal(A.makeStore(s).getSession(), null);
});
