/*
 * Claimable — optional passwordless sign-in with MojoAuth.
 *
 * Why login exists: so people can save their benefits checklist and come back to it
 * (for example after gathering documents). The screener itself never requires an account.
 *
 * Privacy: only the email address goes to MojoAuth, to send a one-time code.
 * Household answers are saved in this browser only, under the signed-in user's ID.
 * Nothing is sent to a Claimable server, because there isn't one.
 *
 * Limitation: with no backend, the MojoAuth token is not verified server-side.
 * That's acceptable here because the saved data never leaves the device. A version
 * that syncs across devices would need to verify the JWT on a server first.
 */
(function (root) {
  "use strict";

  const SESSION_KEY = "claimable-session";
  const SAVED_PREFIX = "claimable-saved:";
  const SESSION_HOURS = 24 * 7;

  // ---------- Pure helpers (unit tested in Node) ----------

  /** Pull the user out of a MojoAuth signIn() response. Returns null if it isn't a successful login. */
  function parseLoginResponse(res, now = Date.now()) {
    if (!res || typeof res !== "object") return null;
    if (res.authenticated === false) return null;
    const user = res.user || {};
    const email = user.identifier || user.email || null;
    const userId = user.user_id || user.id || email;
    if (!userId || !(res.oauth && res.oauth.access_token)) return null;
    return { userId: String(userId), email: email ? String(email) : "", expiresAt: now + SESSION_HOURS * 3600 * 1000 };
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

  const AuthCore = { parseLoginResponse, makeStore, SESSION_KEY, SAVED_PREFIX };
  root.ClaimableAuthCore = AuthCore;
  if (typeof module !== "undefined" && module.exports) { module.exports = AuthCore; return; }

  // ---------- Browser: MojoAuth integration ----------

  const cfg = root.CLAIMABLE_CONFIG || {};
  const apiKey = (cfg.mojoAuthApiKey || "").trim();
  let storage = null;
  try { storage = root.localStorage; } catch (_) { storage = null; }
  const store = makeStore(storage);
  const listeners = [];
  let sdkPromise = null;
  let pendingAfterLogin = null;

  function loadSdk() {
    if (root.MojoAuth) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.mojoauth.com/js/mojoauth.min.js";
      s.charset = "UTF-8";
      s.onload = () => (root.MojoAuth ? resolve() : reject(new Error("MojoAuth SDK did not load")));
      s.onerror = () => { sdkPromise = null; reject(new Error("Couldn't reach the sign-in service. Check your connection.")); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  const Auth = {
    enabled: !!apiKey,
    user() { return store.getSession(); },
    onChange(fn) { listeners.push(fn); },
    _emit() { listeners.forEach((fn) => fn(Auth.user())); },

    /** Render MojoAuth's email-OTP form into #mojoauth-passwordless-form and wait for login. */
    async startSignIn(afterLogin) {
      if (!Auth.enabled) throw new Error("Sign-in isn't set up on this site.");
      pendingAfterLogin = afterLogin || null;
      await loadSdk();
      const container = document.getElementById("mojoauth-passwordless-form");
      if (container) container.innerHTML = "";
      const mojoauth = new root.MojoAuth(apiKey, {
        language: "en",
        source: [{ type: "email", feature: "otp" }],
      });
      const res = await mojoauth.signIn();
      const session = parseLoginResponse(res);
      if (!session) throw new Error("Sign-in isn't available right now. You can keep using Claimable without an account.");
      store.setSession(session);
      Auth._emit();
      const next = pendingAfterLogin;
      pendingAfterLogin = null;
      if (next) next(session);
      return session;
    },

    signOut() { store.clearSession(); Auth._emit(); },

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
