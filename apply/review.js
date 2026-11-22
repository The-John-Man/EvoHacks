(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const auth = window.ClaimableAuth;
  const sample = window.ClaimableSample;
  const boxes = [...$("choices").querySelectorAll("input")];
  const api = new URL("../api/review", location.href);
  const sessionKey = "claimable-practice-session";
  const selectionKey = "claimable-practice-choice";
  let sessionId;
  let expiryTimer;
  let busy = false;

  function readTab(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  function remember(key, value) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch { /* Current-page practice still works with storage disabled. */ }
  }
  function selectedFields() {
    const fields = Object.fromEntries(boxes.filter(b => b.checked).map(b => [b.value, sample[b.value]]));
    if (Object.keys(fields).length) return fields;
    $("review-status").textContent = "Select at least one sample answer to fill.";
    boxes[0].focus();
    return null;
  }
  function setBusy(value) {
    busy = value;
    for (const id of ["choices", "local", "hosted", "reconnect", "end-session", "sign-out"]) $(id).disabled = value;
  }
  function closeViewer(message) {
    clearTimeout(expiryTimer);
    sessionId = null;
    remember(sessionKey, null);
    $("viewer").removeAttribute("src");
    $("live").hidden = true;
    $("setup").hidden = false;
    $("review-status").textContent = message;
  }
  function showViewer(session) {
    const url = new URL(session.viewerUrl);
    const expires = Date.parse(session.expiresAt);
    if (url.protocol !== "https:" || !session.sessionId || !Number.isFinite(expires) || expires <= Date.now()) {
      throw new Error("The practice session has expired. Start again.");
    }
    sessionId = session.sessionId;
    remember(sessionKey, sessionId);
    $("setup").hidden = true;
    $("live").hidden = false;
    $("reconnect").hidden = true;
    $("viewer").hidden = false;
    $("viewer").src = url.href;
    $("live-title").focus();
    $("review-status").textContent = "";
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => closeViewer("Your hosted session ended. You can start a new practice."), expires - Date.now());
  }
  async function apiRequest(method, token, id, fields) {
    const url = new URL(api);
    if (id) url.searchParams.set("id", id);
    const headers = { Authorization: "Bearer " + token };
    if (fields) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method, headers, cache: "no-store", redirect: "error",
      body: fields ? JSON.stringify({ fields }) : undefined,
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "Your sign-in expired. Sign in again to continue."
        : response.status === 404 || response.status === 410 ? "This practice session has ended."
        : "Hosted practice is unavailable. You can practice on this device.");
      error.status = response.status;
      throw error;
    }
    return method === "DELETE" ? null : response.json();
  }

  $("local").addEventListener("click", () => {
    const fields = selectedFields();
    if (!fields) return;
    const local = new URL("../practice/index.html", location.href);
    local.hash = new URLSearchParams(Object.keys(fields).map(key => ["field", key])).toString();
    location.assign(local.href);
  });
  async function startOrResume(resumeId) {
    if (busy) return;
    const fields = resumeId ? null : selectedFields();
    if (!resumeId && !fields) return;
    setBusy(true);
    $("review-status").textContent = resumeId ? "Reopening your practice session…" : "Preparing hosted practice…";
    try {
      const token = await auth.reviewToken();
      if (!token) {
        if (resumeId) return closeViewer("Sign in to start hosted practice.");
        remember(selectionKey, Object.keys(fields).join(","));
        await auth.startSignIn({ returnTo: "apply" });
        return;
      }
      const session = await apiRequest(resumeId ? "GET" : "POST", token, resumeId, fields);
      showViewer(session);
    } catch (error) {
      if (error.status === 401 && !resumeId) {
        remember(selectionKey, Object.keys(fields).join(","));
        try { await auth.startSignIn({ returnTo: "apply" }); }
        catch { closeViewer("Sign-in is unavailable. You can practice on this device."); }
      } else if (resumeId === sessionId && sessionId && ![401, 404, 410].includes(error.status)) {
        $("review-status").textContent = "Could not reconnect. Try again or end the hosted session.";
      } else {
        closeViewer(error.status ? error.message : "Could not open hosted practice. You can practice on this device.");
      }
    } finally {
      setBusy(false);
    }
  }
  $("hosted").addEventListener("click", () => startOrResume(null));
  $("reconnect").addEventListener("click", () => startOrResume(sessionId));
  window.addEventListener("message", (event) => {
    const viewer = $("viewer");
    if (event.data !== "browserbase-disconnected" || !sessionId || !viewer.hasAttribute("src") ||
        event.source !== viewer.contentWindow || event.origin !== new URL(viewer.src).origin) return;
    viewer.hidden = true;
    $("reconnect").hidden = false;
    $("review-status").textContent = "The viewer disconnected. If you finished practice, choose End hosted session. To keep editing, reconnect.";
    $("reconnect").focus();
  });
  async function endSession() {
    if (!sessionId) return;
    const token = await auth.reviewToken();
    const expired = "Your sign-in expired. The hosted session will expire automatically.";
    if (!token) return closeViewer(expired);
    try { await apiRequest("DELETE", token, sessionId); }
    catch (error) {
      if (error.status === 401) return closeViewer(expired);
      if (![404, 410].includes(error.status)) throw error;
    }
    closeViewer("Practice session ended.");
  }
  async function finish(signOut) {
    if (busy) return;
    setBusy(true);
    try {
      await endSession();
      if (signOut) await auth.signOut();
      $("setup-title").focus();
    } catch {
      $("review-status").textContent = "Could not end the hosted session. Try again or let the session expire.";
    } finally {
      setBusy(false);
      $("sign-out").hidden = !auth.user();
    }
  }
  $("end-session").addEventListener("click", () => finish(false));
  $("sign-out").addEventListener("click", () => finish(true));
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== "claimable-session") return;
    if (sessionId) closeViewer("Your account changed. Sign in again to open hosted practice.");
    $("sign-out").hidden = !auth.user();
  });

  async function init() {
    for (const box of boxes) {
      const value = sample[box.value];
      box.parentElement.querySelector("strong").textContent = box.value === "householdSize"
        ? value + " people" : "$" + value.toLocaleString("en-US");
    }
    const choice = readTab(selectionKey);
    if (choice !== null) {
      const selected = choice.split(",");
      for (const box of boxes) box.checked = selected.includes(box.value);
      remember(selectionKey, null);
    }
    if (!auth.enabled || !/^https?:$/.test(location.protocol)) return;
    try {
      const response = await fetch(api, { cache: "no-store", redirect: "error" });
      if (!response.ok || !(await response.json()).available) return;
      $("hosted-option").hidden = false;
      $("sign-out").hidden = !auth.user();
      const prior = readTab(sessionKey);
      if (prior) await startOrResume(prior);
    } catch { /* Static hosting provides on-device practice. */ }
  }
  init();
})();
