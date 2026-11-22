/*
 * Claimable — optional sign-in with MojoAuth over OpenID Connect.
 *
 * Flow: authorization code + PKCE (S256) + state, public client (no client secret;
 * the token request authenticates with client_id only). Implemented with the standard
 * browser OIDC library, oidc-client-ts, which validates the ID token's signature,
 * issuer, audience, and nonce.
 *
 * Why login exists: so people can save their benefits checklist and come back to it
 * (for example after gathering documents). The screener itself never requires an account.
 *
 * Privacy: MojoAuth only sees the email address used to sign in. Household answers are
 * saved in this browser only, under the signed-in user's ID, and never sent to a server.
 * OIDC tokens are kept in sessionStorage for this tab only (cleared when the tab closes);
 * the hosted practice flow also presents the ID token to Claimable's own review API.
 */
(function (root) {
  "use strict";

  const SESSION_KEY = "claimable-session";
  const SAVED_PREFIX = "claimable-saved:";
  const SESSION_HOURS = 24 * 7;
  const OIDC_LIB = "https://cdn.jsdelivr.net/npm/oidc-client-ts@3.1.0/dist/browser/oidc-client-ts.min.js";
  const SCOPES = "openid profile email";

  // ---------- Pure helpers (unit tested in Node) ----------

  /** Turn an oidc-client-ts User into our local session. Returns null unless it's a real sign-in. */
  function sessionFromOidcUser(user, now = Date.now()) {
    if (!user || typeof user !== "object") return null;
    const p = user.profile || {};
    if (!p.sub || !user.id_token) return null;
    return { userId: String(p.sub), email: p.email ? String(p.email) : "", expiresAt: now + SESSION_HOURS * 3600 * 1000 };
  }

  /** The folder the app is served from, e.g. "/" locally or "/EvoHacks/" on GitHub Pages. */
  function appBase(pathname) {
    let p = String(pathname || "/");
    p = p.replace(/\/apply(?:\/(?:index\.html)?)?$/, "/");
    const i = p.indexOf("/auth/callback");
    if (i >= 0) p = p.slice(0, i + 1);
    else p = p.replace(/[^/]*$/, ""); // drop a trailing file name like index.html
    return p.startsWith("/") ? p : "/" + p;
  }

  /** Build the oidc-client-ts settings for a site at origin + base. */
  function oidcSettings(cfg, origin, base) {
    return {
      authority: cfg.oidcIssuer,
      client_id: cfg.oidcClientId,
      redirect_uri: origin + base + "auth/callback",
      post_logout_redirect_uri: origin + base,
      response_type: "code", // authorization code flow; oidc-client-ts adds PKCE (S256) and state
      scope: SCOPES,
      loadUserInfo: false, // email comes from the ID token (scope "email")
      automaticSilentRenew: false,
    };
  }

  /** Wraps a Storage object (localStorage, or a fake in tests); never throws. */
  function makeStore(storage) {
    const get = (k) => { try { const v = storage && storage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } };
    const set = (k, v) => { try { storage && storage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
    const del = (k) => { try { storage && storage.removeItem(k); } catch (_) { /* ignore */ } };
    return {
      getSession(now = Date.now()) {
        const s = get(SESSION_KEY);
        if (!s || !s.userId || !(s.expiresAt > now)) return null;
        return s;
      },
      setSession(s) { return set(SESSION_KEY, s); },
      clearSession() { del(SESSION_KEY); },
      saveResults(userId, answers, now = Date.now()) { return set(SAVED_PREFIX + userId, { answers, savedAt: now }); },
      loadResults(userId) { return get(SAVED_PREFIX + userId); },
      deleteResults(userId) { del(SAVED_PREFIX + userId); },
    };
  }

  const AuthCore = { sessionFromOidcUser, appBase, oidcSettings, makeStore, SESSION_KEY, SAVED_PREFIX, SCOPES };
  root.ClaimableAuthCore = AuthCore;
  if (typeof module !== "undefined" && module.exports) { module.exports = AuthCore; return; }

  // ---------- Browser: OIDC with oidc-client-ts ----------

  const cfg = root.CLAIMABLE_CONFIG || {};
  const enabled = !!((cfg.oidcIssuer || "").trim() && (cfg.oidcClientId || "").trim());
  let storage = null;
  try { storage = root.localStorage; } catch (_) { storage = null; }
  const store = makeStore(storage);
  const base = appBase(root.location.pathname);
  const listeners = [];
  let libPromise = null;
  let mgr = null;

  function loadLib() {
    if (root.oidc && root.oidc.UserManager) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = OIDC_LIB;
      s.onload = () => (root.oidc && root.oidc.UserManager ? resolve() : reject(new Error("Sign-in library didn't load.")));
      s.onerror = () => { libPromise = null; reject(new Error("Couldn't reach the sign-in service. Check your connection.")); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  async function manager() {
    await loadLib();
    if (!mgr) {
      const settings = oidcSettings(cfg, root.location.origin, base);
      settings.userStore = new root.oidc.WebStorageStateStore({ store: root.sessionStorage });
      mgr = new root.oidc.UserManager(settings);
    }
    return mgr;
  }

  const Auth = {
    enabled,
    base,
    user() { return store.getSession(); },
    async reviewToken() {
      const session = Auth.user();
      if (!enabled || !session) return null;
      const user = await (await manager()).getUser();
      if (!user || user.profile.sub !== session.userId || !(user.profile.exp > Date.now() / 1000)) return null;
      return user.id_token || null;
    },
    onChange(fn) { listeners.push(fn); },
    _emit() { listeners.forEach((fn) => fn(Auth.user())); },

    /**
     * Send the user to MojoAuth's hosted login page.
     * intent.save + intent.answers: save this checklist as soon as they come back signed in.
     */
    async startSignIn(intent) {
      if (!enabled) throw new Error("Sign-in isn't set up on this site.");
      const m = await manager();
      await m.signinRedirect({ state: intent || {} });
    },

    /** Runs on /auth/callback: exchange the code (with the PKCE verifier) and start our session. */
    async completeSignIn() {
      const m = await manager();
      const oidcUser = await m.signinRedirectCallback();
      const session = sessionFromOidcUser(oidcUser);
      if (!session) throw new Error("Sign-in didn't return a valid user.");
      store.setSession(session);
      const intent = oidcUser.state || {};
      let saved = false;
      if (intent.save && intent.answers) saved = store.saveResults(session.userId, intent.answers);
      return { session, saved, returnToReview: intent.returnTo === "apply" };
    },

    /** Clear the local session; also end the MojoAuth session if this tab still has the ID token. */
    async signOut() {
      store.clearSession();
      Auth._emit();
      if (!enabled) return;
      try {
        const m = await manager();
        const u = await m.getUser();
        if (u && u.id_token) { await m.signoutRedirect({ id_token_hint: u.id_token }); return; }
        await m.removeUser();
      } catch (_) { /* local sign-out already happened */ }
    },

    save(answers) {
      const u = Auth.user();
      return !!u && store.saveResults(u.userId, answers);
    },
    loadSaved() {
      const u = Auth.user();
      return u ? store.loadResults(u.userId) : null;
    },
    deleteSaved() {
      const u = Auth.user();
      if (u) store.deleteResults(u.userId);
      Auth._emit();
    },
  };

  root.ClaimableAuth = Auth;
})(typeof window !== "undefined" ? window : globalThis);
