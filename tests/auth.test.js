const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../js/auth.js");

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const oidcUser = {
  id_token: "eyJ...",
  access_token: "at",
  token_type: "Bearer",
  expires_at: 2000000000,
  profile: { sub: "u_123", email: "pat@example.com", iss: "https://x.auth.mojoauth.com", aud: "client" },
  state: { save: true, answers: { state: "TX" } },
};

test("sessionFromOidcUser keeps only the user id, email, and an expiry", () => {
  const s = A.sessionFromOidcUser(oidcUser, 1000);
  assert.deepEqual(Object.keys(s).sort(), ["email", "expiresAt", "userId"]);
  assert.equal(s.userId, "u_123");
  assert.equal(s.email, "pat@example.com");
  assert.ok(s.expiresAt > 1000);
});

test("sessionFromOidcUser rejects missing or partial users", () => {
  assert.equal(A.sessionFromOidcUser(null), null);
  assert.equal(A.sessionFromOidcUser("nope"), null);
  assert.equal(A.sessionFromOidcUser({ id_token: "t", profile: {} }), null);
  assert.equal(A.sessionFromOidcUser({ profile: { sub: "x" } }), null);
  const noEmail = A.sessionFromOidcUser({ id_token: "t", profile: { sub: "x" } });
  assert.equal(noEmail.email, "");
});

test("appBase works locally, on GitHub Pages, and on the callback page", () => {
  assert.equal(A.appBase("/"), "/");
  assert.equal(A.appBase("/index.html"), "/");
  assert.equal(A.appBase("/auth/callback"), "/");
  assert.equal(A.appBase("/auth/callback/"), "/");
  assert.equal(A.appBase("/EvoHacks/"), "/EvoHacks/");
  assert.equal(A.appBase("/EvoHacks/index.html"), "/EvoHacks/");
  assert.equal(A.appBase("/EvoHacks/auth/callback/"), "/EvoHacks/");
});

test("OIDC settings: code flow, public client, correct redirect URIs and scopes", () => {
  const cfg = { oidcIssuer: "https://test.auth.mojoauth.com", oidcClientId: "test_abc" };
  const s = A.oidcSettings(cfg, "http://localhost:5321", "/");
  assert.equal(s.authority, "https://test.auth.mojoauth.com");
  assert.equal(s.client_id, "test_abc");
  assert.equal(s.response_type, "code");
  assert.equal(s.scope, "openid profile email");
  assert.equal(s.redirect_uri, "http://localhost:5321/auth/callback");
  assert.equal(s.post_logout_redirect_uri, "http://localhost:5321/");
  assert.equal("client_secret" in s, false, "public client: never a secret");
  const gh = A.oidcSettings(cfg, "https://me.github.io", "/EvoHacks/");
  assert.equal(gh.redirect_uri, "https://me.github.io/EvoHacks/auth/callback");
});

test("session expires and can be cleared", () => {
  const store = A.makeStore(fakeStorage());
  const s = A.sessionFromOidcUser(oidcUser, 0);
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
  store.deleteResults("u1");
  assert.equal(store.loadResults("u1"), null);
  assert.equal(store.loadResults("u2").answers.state, "OH");
});

test("blocked, missing, or corrupted storage never throws", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const store = A.makeStore(broken);
  assert.equal(store.getSession(), null);
  assert.equal(store.saveResults("x", {}), false);
  assert.doesNotThrow(() => store.clearSession());
  assert.equal(A.makeStore(null).loadResults("x"), null);
  assert.equal(A.makeStore(null).saveResults("x", {}), false);
  const s = fakeStorage();
  s.setItem(A.SESSION_KEY, "{not json");
  assert.equal(A.makeStore(s).getSession(), null);
});
