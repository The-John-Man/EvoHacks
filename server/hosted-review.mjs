import { createHmac, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import SAMPLE from "../js/practice-sample.js";

const SESSION_SECONDS = 600;
const SESSION_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const API = "https://api.browserbase.com/v1/sessions";

class ReviewError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function config(env) {
  const { BROWSERBASE_API_KEY: key, BROWSERBASE_PROJECT_ID: projectId,
    CLAIMABLE_PUBLIC_ORIGIN: origin, MOJOAUTH_ISSUER: issuer, MOJOAUTH_CLIENT_ID: clientId } = env;
  if (!key || !projectId || !origin || !issuer || !clientId) return null;
  try {
    const canonical = new URL(origin);
    if (canonical.protocol !== "https:" || origin.replace(/\/$/, "") !== canonical.origin) return null;
    if (new URL(issuer).protocol !== "https:") return null;
    return { key, projectId, origin: canonical.origin, issuer, clientId };
  } catch { return null; }
}

// These are the only values sent to the hosted practice page. Never accept an
// applicant's own screening answers, raw documents, a browser URL, or a selector.
function fictionalFields(body) {
  try {
    if (typeof body === "string") body = JSON.parse(body);
    if (!body || Object.keys(body).length !== 1 || !body.fields || Array.isArray(body.fields)) throw new Error();
    const entries = Object.entries(body.fields);
    if (!entries.length || entries.some(([name, value]) => !Object.hasOwn(SAMPLE, name) || SAMPLE[name] !== value)) throw new Error();
    return Object.fromEntries(entries);
  } catch { throw new ReviewError(400, "Choose at least one field from the fictional example."); }
}

// Discover keys only from the configured issuer. jose caches its keys and
// refreshes them on rotation. The caller's local checklist identity is unused.
let cachedKeys;
async function verifyIdentity(token, cfg) {
  if (cachedKeys?.issuer !== cfg.issuer) {
    const discovery = await fetch(cfg.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(5000), redirect: "error",
    });
    if (!discovery.ok) throw new ReviewError(503, "Sign-in verification is unavailable.");
    const metadata = await discovery.json();
    if (metadata.issuer !== cfg.issuer || new URL(metadata.jwks_uri).protocol !== "https:") {
      throw new ReviewError(503, "Check the configured sign-in issuer.");
    }
    cachedKeys = { issuer: cfg.issuer, keys: createRemoteJWKSet(new URL(metadata.jwks_uri)) };
  }
  try {
    const { payload } = await jwtVerify(token, cachedKeys.keys, {
      algorithms: ["RS256", "ES256"], issuer: cfg.issuer, audience: cfg.clientId,
      requiredClaims: ["sub", "iat", "exp"],
    });
    if (typeof payload.sub !== "string" || !payload.sub ||
        ((payload.azp !== undefined || (Array.isArray(payload.aud) && payload.aud.length > 1)) && payload.azp !== cfg.clientId)) {
      throw new Error();
    }
    return payload.sub;
  } catch { throw new ReviewError(401, "Sign in again to open hosted review."); }
}

async function providerRequest(cfg, path, body) {
  const response = await fetch(API + path, {
    method: body ? "POST" : "GET", headers: { "X-BB-API-Key": cfg.key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), redirect: "error",
  });
  if (response.status === 404) throw new ReviewError(404, "Review session not found.");
  if (response.status === 429) throw new ReviewError(429, "Hosted review is busy. Try again shortly.");
  if (!response.ok) throw new ReviewError(502, "The browser host is unavailable. Try the local practice option.");
  return response.json();
}

async function runDriver(options) {
  const { preparePracticeApplication } = await import("../scripts/autofill.mjs");
  await preparePracticeApplication(options);
}

// The hosted practice page receives authority only to end this one session.
// A purpose prefix separates this MAC from the owner tag made with the same key.
function releaseSignature(cfg, id, expiresAt) {
  const scope = ["claimable/practice-release/v1", cfg.projectId, cfg.origin, id, expiresAt];
  return createHmac("sha256", cfg.key).update(JSON.stringify(scope)).digest();
}

function createReleaseTicket(cfg, session) {
  const deadline = Math.min(Date.parse(session.expiresAt), Date.now() + SESSION_SECONDS * 1000);
  if (!Number.isSafeInteger(deadline) || deadline <= Date.now()) throw new ReviewError(410, "The practice session expired.");
  return deadline + "." + releaseSignature(cfg, session.id, deadline).toString("hex");
}

function verifyReleaseTicket(cfg, id, body) {
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || Object.keys(body).length !== 1 || typeof body.ticket !== "string") {
    throw new ReviewError(400, "Expected a release ticket.");
  }
  const parts = /^(\d{13})\.([a-f0-9]{64})$/.exec(body.ticket);
  if (!parts || !timingSafeEqual(releaseSignature(cfg, id, Number(parts[1])), Buffer.from(parts[2], "hex"))) {
    throw new ReviewError(403, "Invalid release ticket.");
  }
  if (Number(parts[1]) <= Date.now()) throw new ReviewError(410, "The release ticket expired.");
}

function active(session) {
  return session.status === "RUNNING" || session.status === "PENDING";
}

export function createReviewHandler({ env = process.env, verify = verifyIdentity, request = providerRequest, prepare = runDriver } = {}) {
  return async function handle(req, res) {
    const send = (status, value) => {
      res.statusCode = status;
      res.end(value === undefined ? undefined : JSON.stringify(value));
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const cfg = config(env);
      const id = new URL(req.url, "http://localhost").searchParams.get("id");
      if (req.method === "GET" && id === null) return send(200, { available: !!cfg });
      if (!["GET", "POST", "DELETE"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, DELETE");
        throw new ReviewError(405, "Unsupported review action.");
      }
      if (!cfg) throw new ReviewError(503, "Hosted review is not configured on this site.");
      const release = sessionId => request(cfg, "/" + sessionId, { projectId: cfg.projectId, status: "REQUEST_RELEASE" });
      if (req.method === "POST" && id !== null) {
        if (!SESSION_ID.test(id)) throw new ReviewError(400, "Invalid session ID.");
        verifyReleaseTicket(cfg, id, req.body);
        const session = await request(cfg, "/" + id);
        if (session.id !== id || session.projectId !== cfg.projectId) throw new ReviewError(404, "Review session not found.");
        if (active(session)) await release(id);
        return send(204);
      }
      const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
      if (!token) throw new ReviewError(401, "Sign in to open hosted review.");
      const sub = await verify(token, cfg);
      const owner = createHmac("sha256", cfg.key).update(JSON.stringify([cfg.issuer, cfg.clientId, cfg.origin, sub])).digest("hex");

      async function view(session) {
        if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
          throw new ReviewError(410, "The practice session expired. Start a new one.");
        }
        const links = await request(cfg, "/" + session.id + "/debug?expiresIn=" + SESSION_SECONDS);
        // Select only the practice page. The provider's browser-level CDP URL
        // and signing key must stay on this server.
        const page = links.pages?.find(p => p.url?.split("#")[0] === cfg.origin + "/practice/");
        const viewer = new URL(page?.debuggerFullscreenUrl);
        if (viewer.protocol !== "https:" || !/(^|\.)browserbase\.com$/.test(viewer.hostname)) throw new Error();
        return { sessionId: session.id, viewerUrl: viewer.href, expiresAt: session.expiresAt };
      }

      if (req.method === "POST") {
        const answers = fictionalFields(req.body);
        const session = await request(cfg, "", {
          projectId: cfg.projectId, keepAlive: true, timeout: SESSION_SECONDS, userMetadata: { claimableOwner: owner },
          browserSettings: {
            recordSession: false, logSession: false, solveCaptchas: false,
            allowedDomains: [new URL(cfg.origin).hostname], viewport: { width: 390, height: 844 },
          },
        });
        if (!SESSION_ID.test(session.id)) throw new Error();
        try {
          await prepare({ origin: cfg.origin, cdpEndpoint: session.connectUrl, answers,
            release: { sessionId: session.id, ticket: createReleaseTicket(cfg, session) },
          });
          return send(201, await view(session));
        } catch (error) {
          // Even if the provider cannot release now, its hard timeout applies.
          await release(session.id).catch(() => {});
          throw error;
        }
      }
      if (!SESSION_ID.test(id || "")) throw new ReviewError(400, "Invalid session ID.");
      const session = await request(cfg, "/" + id);
      if (session.projectId !== cfg.projectId || session.userMetadata?.claimableOwner !== owner) {
        throw new ReviewError(404, "Review session not found.");
      }
      if (req.method === "DELETE") {
        if (active(session)) await release(id);
        return send(204);
      }
      if (!active(session)) throw new ReviewError(410, "The practice session ended. Start a new one.");
      return send(200, await view(session));
    } catch (error) {
      if (error instanceof ReviewError) return send(error.status, { error: error.message });
      return send(502, { error: "Could not prepare the hosted browser. Try the local practice option." });
    }
  };
}
