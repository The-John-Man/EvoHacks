import test from "node:test";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createReviewHandler } from "../server/hosted-review.mjs";

const id = "12345678-1234-4321-abcd-123456789abc";
const env = {
  BROWSERBASE_API_KEY: "fixture-host-key", BROWSERBASE_PROJECT_ID: "fixture-project",
  CLAIMABLE_PUBLIC_ORIGIN: "https://practice.example", MOJOAUTH_ISSUER: "https://issuer.example",
  MOJOAUTH_CLIENT_ID: "fixture-client",
};

function setup(overrides = {}) {
  const calls = [], fills = [];
  let record;
  const request = async (cfg, path, body) => {
    calls.push({ path, body });
    if (path === "") {
      record = { id, projectId: cfg.projectId, userMetadata: body.userMetadata, status: "RUNNING",
        connectUrl: "wss://private.example/cdp", expiresAt: new Date(Date.now() + 600000).toISOString() };
      return record;
    }
    if (path.endsWith("/debug?expiresIn=600")) return {
      wsUrl: record.connectUrl, pages: [{ url: env.CLAIMABLE_PUBLIC_ORIGIN + "/practice/", debuggerFullscreenUrl: "https://www.browserbase.com/view/fixture" }],
    };
    if (body?.status === "REQUEST_RELEASE") record.status = "COMPLETED";
    return record;
  };
  const handle = createReviewHandler({
    env, request, verify: async token => token, prepare: async options => fills.push(options), ...overrides,
  });
  async function invoke(method, { token = "alice", sessionId, body } = {}) {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(text) { this.result = text ? JSON.parse(text) : null; },
    };
    await handle({
      url: "/api/review" + (sessionId ? "?id=" + sessionId : ""),
      method, headers: token ? { authorization: "Bearer " + token } : {}, body,
    }, res);
    return res;
  }
  return { invoke, calls, fills };
}

test("static availability check discloses only a configuration flag", async () => {
  const { invoke, calls } = setup();
  const flag = await invoke("GET", { token: null });
  assert.deepEqual(flag.result, { available: true });
  assert.match(flag.headers["Cache-Control"], /no-store/);
  assert.deepEqual(calls, []);
  const disabled = setup({ env: {} });
  assert.deepEqual((await disabled.invoke("GET")).result, { available: false });
  assert.equal((await disabled.invoke("POST")).statusCode, 503);
});

test("rejects anonymous, unexpected and personally entered data before allocating a browser", async () => {
  const { invoke, calls } = setup();
  assert.equal((await invoke("POST", { token: null })).statusCode, 401);
  for (const body of [null, "{", { fields: {} }, { fields: { income: 1100 } }, { fields: { rentMonthly: 1450 } },
    { fields: { rentMonthly: "1100" } }, { fields: { rentMonthly: 1100 }, url: "https://example.com" }]) {
    assert.equal((await invoke("POST", { body })).statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

test("creates only an isolated practice session and returns only interactive viewer access", async () => {
  const { invoke, calls, fills } = setup();
  const fields = { rentMonthly: 1100 };
  const response = await invoke("POST", { body: { fields } });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(Object.keys(response.result).sort(), ["expiresAt", "sessionId", "viewerUrl"]);
  const allocation = calls[0].body;
  assert.ok(allocation.keepAlive);
  assert.equal(allocation.timeout, 600);
  assert.deepEqual(allocation.browserSettings.allowedDomains, ["practice.example"]);
  assert.equal(allocation.browserSettings.solveCaptchas, false);
  assert.equal(allocation.browserSettings.recordSession, false);
  assert.equal(allocation.browserSettings.logSession, false);
  assert.match(allocation.userMetadata.claimableOwner, /^[a-f0-9]{64}$/);
  const [{ release, ...driverOptions }] = fills;
  assert.deepEqual(driverOptions, { answers: fields, origin: env.CLAIMABLE_PUBLIC_ORIGIN, cdpEndpoint: "wss://private.example/cdp" });
  assert.equal(release.sessionId, id);
  assert.equal(typeof release.ticket, "string");
  assert.ok(!JSON.stringify(response.result).includes(release.ticket));
  assert.equal(calls[1].path, "/" + id + "/debug?expiresIn=600");
});

test("only the verified owner can reconnect or release; release is idempotent", async () => {
  const { invoke, calls } = setup();
  await invoke("POST", { body: { fields: { utilitiesMonthly: 180 } } });
  const options = { sessionId: id };
  const readsBefore = calls.filter(c => c.path.includes("/debug")).length;
  assert.equal((await invoke("GET", { ...options, token: "bob" })).statusCode, 404);
  assert.equal((await invoke("DELETE", { ...options, token: "bob" })).statusCode, 404);
  assert.equal(calls.filter(c => c.path.includes("/debug")).length, readsBefore);
  assert.equal((await invoke("GET", options)).statusCode, 200);
  assert.equal((await invoke("DELETE", options)).statusCode, 204);
  assert.equal((await invoke("DELETE", options)).statusCode, 204);
  assert.equal((await invoke("GET", options)).statusCode, 410);
  assert.equal(calls.filter(c => c.body?.status === "REQUEST_RELEASE").length, 1);
});

test("the signed release ticket closes its session on POST and repeated completion is harmless", async () => {
  const { invoke, calls, fills } = setup();
  await invoke("POST", { body: { fields: { householdSize: 3 } } });
  const body = { ticket: fills[0].release.ticket };
  const options = { token: null, sessionId: id, body };
  assert.equal((await invoke("GET", options)).statusCode, 401);
  assert.equal((await invoke("DELETE", options)).statusCode, 401);
  assert.equal((await invoke("POST", { token: null, body })).statusCode, 401);
  assert.equal((await invoke("POST", { ...options, body: { ...body, url: "https://elsewhere.example" } })).statusCode, 400);
  assert.equal((await invoke("POST", options)).statusCode, 204);
  assert.equal((await invoke("POST", { ...options, body: JSON.stringify(body) })).statusCode, 204);
  assert.equal(calls.filter(call => call.body?.status === "REQUEST_RELEASE").length, 1);
  assert.equal((await invoke("GET", { sessionId: id })).statusCode, 410);
});

test("a release ticket is bound to its expiry, ID, project, and origin before any provider lookup", async t => {
  const { invoke, calls, fills } = setup();
  await invoke("POST", { body: { fields: { householdSize: 3 } } });
  const before = calls.length;
  const ticket = fills[0].release.ticket;
  const options = { token: null, sessionId: id, body: { ticket } };
  const tampered = ticket.slice(0, -1) + (ticket.endsWith("f") ? "0" : "f");
  assert.equal((await invoke("POST", { ...options, body: { ticket: tampered } })).statusCode, 403);
  assert.equal((await invoke("POST", { ...options, sessionId: "22345678-1234-4321-abcd-123456789abc" })).statusCode, 403);
  for (const change of [{ BROWSERBASE_PROJECT_ID: "other-project" }, { CLAIMABLE_PUBLIC_ORIGIN: "https://other.example" }]) {
    const other = setup({ env: { ...env, ...change } });
    assert.equal((await other.invoke("POST", options)).statusCode, 403);
    assert.deepEqual(other.calls, []);
  }
  const later = Date.now() + 600001;
  t.mock.method(Date, "now", () => later);
  assert.equal((await invoke("POST", options)).statusCode, 410);
  assert.equal(calls.length, before);
});

test("provider sessions are released after MCP failure and provider credentials stay out of errors", async () => {
  const { invoke, calls } = setup({ prepare: async () => { throw new Error("private-cdp-secret"); } });
  const result = await invoke("POST", { body: { fields: { householdSize: 3 } } });
  assert.equal(result.statusCode, 502);
  assert.doesNotMatch(result.result.error, /private-cdp-secret/);
  assert.equal(calls.at(-1).body.status, "REQUEST_RELEASE");
});

test("real verifier checks MojoAuth signature, issuer, audience and expiration before allocating", async t => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const forged = await generateKeyPair("RS256");
  const issuer = env.MOJOAUTH_ISSUER;
  const publicJwk = { ...await exportJWK(publicKey), kid: "fixture", alg: "RS256" };
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url) === issuer + "/.well-known/openid-configuration") {
      return Response.json({ issuer, jwks_uri: issuer + "/keys" });
    }
    assert.equal(String(url), issuer + "/keys");
    return Response.json({ keys: [publicJwk] });
  });
  const { invoke, calls } = setup({ verify: undefined });
  const claims = { iss: issuer, aud: env.MOJOAUTH_CLIENT_ID, sub: "good-user", exp: Math.floor(Date.now() / 1000) + 120 };
  const sign = (c, key = privateKey) => new SignJWT(c).setIssuedAt().setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(key);
  const body = { fields: { rentMonthly: 1100 } };
  for (const token of [await sign({ ...claims, exp: 0 }), await sign({ ...claims, iss: "https://wrong.example" }),
    await sign({ ...claims, aud: "other-client" }), await sign(claims, forged.privateKey)]) {
    assert.equal((await invoke("POST", { token, body })).statusCode, 401);
  }
  assert.equal(calls.length, 0);
  assert.equal((await invoke("POST", { token: await sign(claims), body })).statusCode, 201);
});
