(function (root) {
  "use strict";

  const SESSION_KEY = "claimable-session";
  const SAVED_PREFIX = "claimable-saved:";
  const TRACK_PREFIX = "claimable-track:";
  const SESSION_HOURS = 24 * 7;
  const OIDC_LIB = "https://cdn.jsdelivr.net/npm/oidc-client-ts@3.1.0/dist/browser/oidc-client-ts.min.js";
  const SCOPES = "openid profile email";

  function sessionFromOidcUser(user, now = Date.now()) {
    if (typeof user !== "object" || !user?.profile?.sub || !user.id_token) return null;
    return {
      userId: String(user.profile.sub),
      email: user.profile.email ? String(user.profile.email) : "",
      expiresAt: now + SESSION_HOURS * 3600 * 1000,
    };
  }

  function appBase(pathname) {
    const path = String(pathname || "/");
    const callback = path.indexOf("/auth/callback");
    const base = callback >= 0 ? path.slice(0, callback + 1) : path.replace(/[^/]*$/, "");
    return base.startsWith("/") ? base : "/" + base;
  }

  function oidcSettings(cfg, origin, base) {
    return {
      authority: cfg.oidcIssuer,
      client_id: cfg.oidcClientId,
      redirect_uri: origin + base + "auth/callback",
      post_logout_redirect_uri: origin + base,
      response_type: "code",
      scope: SCOPES,
      loadUserInfo: false,
      automaticSilentRenew: false,
    };
  }

  function makeStore(storage) {
    function get(key) {
      try {
        return JSON.parse(storage.getItem(key));
      } catch {
        return null;
      }
    }

    function set(key, value) {
      try {
        storage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }

    function remove(key) {
      try { storage.removeItem(key); } catch {}
    }

    return {
      getSession(now = Date.now()) {
        const session = get(SESSION_KEY);
        return session?.userId && session.expiresAt > now ? session : null;
      },
      setSession(session) { return set(SESSION_KEY, session); },
      clearSession() { remove(SESSION_KEY); },
      saveResults(userId, answers, now = Date.now()) { return set(SAVED_PREFIX + userId, { answers, savedAt: now }); },
      loadResults(userId) { return get(SAVED_PREFIX + userId); },
      deleteResults(userId) {
        remove(SAVED_PREFIX + userId);
        remove(TRACK_PREFIX + userId);
      },
      saveTracking(userId, tracking) { return set(TRACK_PREFIX + userId, tracking || {}); },
      loadTracking(userId) { return get(TRACK_PREFIX + userId) || {}; },
    };
  }

  const AuthCore = { sessionFromOidcUser, appBase, oidcSettings, makeStore, SESSION_KEY, SAVED_PREFIX, TRACK_PREFIX, SCOPES };
  root.ClaimableAuthCore = AuthCore;
  if (typeof module !== "undefined" && module.exports) { module.exports = AuthCore; return; }

  const cfg = root.CLAIMABLE_CONFIG || {};
  const enabled = !!((cfg.oidcIssuer || "").trim() && (cfg.oidcClientId || "").trim());
  let storage = null;
  try { storage = root.localStorage; } catch {}
  const store = makeStore(storage);
  const base = appBase(root.location.pathname);
  const listeners = [];
  let libPromise = null;
  let mgr = null;

  function loadLib() {
    if (root.oidc?.UserManager) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = OIDC_LIB;
      script.onload = () => root.oidc?.UserManager ? resolve() : reject(new Error("Sign-in library didn't load."));
      script.onerror = () => {
        libPromise = null;
        reject(new Error("Couldn't reach the sign-in service. Check your connection."));
      };
      document.head.appendChild(script);
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
    onChange(fn) { listeners.push(fn); },
    _emit() { listeners.forEach((fn) => fn(Auth.user())); },

    async startSignIn(intent) {
      if (!enabled) throw new Error("Sign-in isn't set up on this site.");
      const m = await manager();
      await m.signinRedirect({ state: intent || {} });
    },

    async completeSignIn() {
      const m = await manager();
      const oidcUser = await m.signinRedirectCallback();
      const session = sessionFromOidcUser(oidcUser);
      if (!session) throw new Error("Sign-in didn't return a valid user.");
      if (!store.setSession(session)) {
        throw Object.assign(new Error("Your browser could not keep the sign-in session."), { code: "session_storage_unavailable" });
      }
      const intent = oidcUser.state || {};
      let saved = false;
      if (intent.save && intent.answers) {
        saved = store.saveResults(session.userId, intent.answers);
        if (!saved) throw Object.assign(new Error("Your checklist could not be saved."), { code: "checklist_storage_unavailable" });
      }
      if (intent.tracking && typeof intent.tracking === "object") {
        const recorded = store.saveTracking(session.userId, { ...store.loadTracking(session.userId), ...intent.tracking });
        if (!recorded) throw Object.assign(new Error("Your timeline could not be saved."), { code: "checklist_storage_unavailable" });
      }
      return { session, saved };
    },

    async signOut() {
      store.clearSession();
      Auth._emit();
      if (!enabled) return;
      try {
        const m = await manager();
        const u = await m.getUser();
        if (u && u.id_token) { await m.signoutRedirect({ id_token_hint: u.id_token }); return; }
        await m.removeUser();
      } catch {}
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
    saveTracking(tracking) {
      const u = Auth.user();
      return !!u && store.saveTracking(u.userId, tracking);
    },
    loadTracking() {
      const u = Auth.user();
      return u ? store.loadTracking(u.userId) : null;
    },
  };

  root.addEventListener("storage", (event) => {
    if (event.storageArea !== storage) return;
    const user = Auth.user();
    if (event.key === null || event.key === SESSION_KEY || (user && event.key === SAVED_PREFIX + user.userId)) {
      Auth._emit();
    }
  });
  root.ClaimableAuth = Auth;
})(typeof window !== "undefined" ? window : globalThis);
