/* Claimable — UI. Reads the form, calls Claimable.screen(), renders results. */
(function () {
  "use strict";

  const D = window.ClaimableData;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  const views = { intro: $("#view-intro"), signin: $("#view-signin"), form: $("#view-form"), results: $("#view-results") };
  const Auth = window.ClaimableAuth || { enabled: false, user: () => null, onChange() {}, loadSaved: () => null };
  let currentView = "intro";
  let returnView = "intro";
  const form = $("#form");
  const steps = $$(".step");
  let step = 0;
  let lastResult = null;
  let filter = "all";

  // ---------- Example households (for demos) ----------
  const DEMOS = [
    {
      title: "Maria, single mom in Texas",
      desc: "2 kids (ages 3 and 8), $2,100/month from work, rents, no insurance",
      data: { state: "TX", adults: 1, seniors: 0, adultWorkingAge: true, children: [3, 8], earnedMonthly: 2100, otherMonthly: 0, rentMonthly: 1100, utilitiesMonthly: 180, housing: "rent", insurance: "none", paysEnergy: true, needsChildcare: true },
    },
    {
      title: "James & Lena, family of five in Ohio",
      desc: "Married, 3 kids (1, 6, 11), $3,800/month, kids already on Medicaid",
      data: { state: "OH", adults: 2, seniors: 0, married: true, adultWorkingAge: true, children: [1, 6, 11], earnedMonthly: 3800, otherMonthly: 0, rentMonthly: 1350, utilitiesMonthly: 240, housing: "rent", insurance: "employer", paysEnergy: true, behindUtilities: true, en_medicaid: true },
    },
    {
      title: "Dorothy, 71, living alone in Florida",
      desc: "$1,150/month Social Security, owns her home, has hospital bills",
      data: { state: "FL", adults: 1, seniors: 1, adultWorkingAge: false, children: [], earnedMonthly: 0, otherMonthly: 1150, rentMonthly: 0, utilitiesMonthly: 210, housing: "own", insurance: "other", paysEnergy: true, medicalBills: true },
    },
    {
      title: "Alex, 26, gig worker and student in California",
      desc: "$1,400/month from delivery apps, rents a room, no insurance",
      data: { state: "CA", adults: 1, seniors: 0, adultWorkingAge: true, children: [], earnedMonthly: 1400, otherMonthly: 0, rentMonthly: 900, utilitiesMonthly: 60, housing: "rent", insurance: "none", paysEnergy: false, student: true },
    },
  ];

  // ---------- Setup ----------
  function init() {
    const stateSel = $("#state");
    stateSel.innerHTML = '<option value="">Choose your state</option>' +
      D.states.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    $("#as-of").textContent = D.asOf;

    $("#demo-list").innerHTML = DEMOS.map((d, i) =>
      `<button type="button" class="demo-btn" data-demo="${i}"><strong>${d.title}</strong><span>${d.desc}</span></button>`).join("");
    $("#demo-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-demo]");
      if (!b) return;
      fillForm(DEMOS[+b.dataset.demo].data);
      runScreen();
    });

    $("#start").addEventListener("click", () => { show("form"); goStep(0); });
    $("#brand-home").addEventListener("click", (e) => { e.preventDefault(); stopSpeech(); show("intro"); });
    $("#add-kid").addEventListener("click", () => addKid());
    $("#back").addEventListener("click", () => (step === 0 ? show("intro") : goStep(step - 1)));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validate()) return;
      if (step < steps.length - 1) goStep(step + 1);
      else runScreen();
    });
    $("#edit").addEventListener("click", () => { stopSpeech(); show("form"); goStep(0); });
    $("#print").addEventListener("click", () => window.print());
    $("#read").addEventListener("click", toggleSpeech);
    $$(".chip").forEach((c) => c.addEventListener("click", () => {
      filter = c.dataset.filter;
      $$(".chip").forEach((x) => x.setAttribute("aria-selected", String(x === c)));
      render();
    }));

    // Select number contents on focus so typing replaces the value instead of appending to it.
    form.addEventListener("focusin", (e) => {
      if (e.target.matches('input[type="number"]')) setTimeout(() => e.target.select(), 0);
    });

    initAuth();

    const sizeBtn = $("#text-size");
    try { if (localStorage.getItem("claimable-large") === "1") setLarge(true); } catch (_) { /* storage blocked */ }
    sizeBtn.addEventListener("click", () => setLarge(!document.documentElement.classList.contains("large")));
  }

  function setLarge(on) {
    document.documentElement.classList.toggle("large", on);
    $("#text-size").setAttribute("aria-pressed", String(on));
    try { localStorage.setItem("claimable-large", on ? "1" : "0"); } catch (_) { /* ignore */ }
  }

  function show(name) {
    currentView = name;
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    window.scrollTo(0, 0);
    refreshAuthUI();
  }

  // ---------- Optional sign-in (MojoAuth) ----------
  function initAuth() {
    if (!Auth.enabled) return; // no API key configured: login stays hidden, app works as before
    Auth.onChange(refreshAuthUI);
    $("#sign-in").addEventListener("click", () => openSignIn(null));
    $("#sign-out").addEventListener("click", () => { Auth.signOut(); $("#save-status").hidden = true; show("intro"); });
    $("#signin-cancel").addEventListener("click", () => show(returnView));
    $("#save").addEventListener("click", () => {
      if (Auth.user()) { saveChecklist(); return; }
      openSignIn(() => { show("results"); saveChecklist(); });
    });
    $("#open-saved").addEventListener("click", () => {
      const saved = Auth.loadSaved();
      if (!saved) return;
      fillForm(answersToForm(saved.answers));
      runScreen();
    });
    $("#delete-saved").addEventListener("click", () => {
      if (!window.confirm("Delete your saved checklist from this device? This can't be undone.")) return;
      Auth.deleteSaved();
      $("#save-status").textContent = "Your saved checklist was deleted from this device.";
      $("#save-status").hidden = false;
    });
    refreshAuthUI();
  }

  function openSignIn(afterLogin) {
    returnView = currentView === "signin" ? returnView : currentView;
    show("signin");
    const err = $("#signin-error");
    err.hidden = true;
    Auth.startSignIn(afterLogin)
      .then(() => { if (!afterLogin) show(returnView === "signin" ? "intro" : returnView); })
      .catch((e) => { err.textContent = e.message || "Sign-in failed. Please try again."; err.hidden = false; });
  }

  function saveChecklist() {
    const u = Auth.user();
    const ok = Auth.save(readForm());
    const status = $("#save-status");
    status.textContent = ok
      ? `Saved on this device for ${u.email || "your account"}. Sign in here anytime to reopen it.`
      : "Couldn't save. Your browser may be blocking storage (private mode?).";
    status.hidden = false;
    refreshAuthUI();
  }

  function refreshAuthUI() {
    if (!Auth.enabled) return;
    const u = Auth.user();
    $("#sign-in").hidden = !!u || currentView === "signin";
    $("#account").hidden = !u;
    $("#account-email").textContent = u ? u.email : "";
    $("#save").hidden = false;
    const saved = u ? Auth.loadSaved() : null;
    $("#welcome-back").hidden = !saved;
    $("#delete-saved-wrap").hidden = !saved;
    if (saved) $("#saved-date").textContent = new Date(saved.savedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }

  /** Saved answers use the readForm() shape; turn them back into form field values. */
  function answersToForm(a) {
    const out = { ...a };
    delete out.enrolled;
    Object.entries(a.enrolled || {}).forEach(([k, v]) => (out["en_" + k] = v));
    return out;
  }

  function goStep(n) {
    step = n;
    steps.forEach((s, i) => (s.hidden = i !== n));
    $$(".steps li").forEach((li, i) => {
      li.classList.toggle("active", i === n);
      li.classList.toggle("done", i < n);
      if (i === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $("#next").textContent = n === steps.length - 1 ? "See my results" : "Next";
    $("#back").textContent = n === 0 ? "Cancel" : "Back";
    $("#form-error").hidden = true;
    window.scrollTo(0, 0);
    const first = steps[n].querySelector("select, input");
    if (first) first.focus({ preventScroll: true });
  }

  // ---------- Children ----------
  let kidId = 0;
  function addKid(age) {
    const id = "kid-" + kidId++;
    const row = document.createElement("div");
    row.className = "kid-row";
    row.innerHTML = `<div><label for="${id}">Child's age</label>
      <input id="${id}" class="kid-age" type="number" inputmode="numeric" min="0" max="18" value="${age ?? ""}" placeholder="e.g. 4"></div>
      <button type="button" class="btn btn-ghost" aria-label="Remove this child">Remove</button>`;
    row.querySelector("button").addEventListener("click", () => row.remove());
    $("#kids").appendChild(row);
    if (age === undefined) row.querySelector("input").focus();
  }

  // ---------- Form <-> data ----------
  function readForm() {
    const f = new FormData(form);
    const num = (k) => Math.max(0, parseFloat(f.get(k)) || 0);
    const on = (k) => f.get(k) === "on";
    const enrolled = {};
    ["snap", "medicaid", "wic", "ssi", "tanf", "liheap", "lifeline", "schoolMeals", "housing", "headStart", "childcare"]
      .forEach((k) => (enrolled[k] = on("en_" + k)));
    return {
      state: f.get("state"),
      adults: Math.max(1, Math.round(num("adults"))),
      seniors: Math.round(num("seniors")),
      married: on("married"),
      adultWorkingAge: on("adultWorkingAge"),
      disabled: on("disabled"),
      pregnant: on("pregnant"),
      children: $$(".kid-age").map((i) => parseInt(i.value, 10)).filter((a) => Number.isFinite(a)),
      earnedMonthly: num("earnedMonthly"),
      otherMonthly: num("otherMonthly"),
      rentMonthly: num("rentMonthly"),
      utilitiesMonthly: num("utilitiesMonthly"),
      investmentOver: on("investmentOver"),
      housing: f.get("housing"),
      insurance: f.get("insurance"),
      paysEnergy: on("paysEnergy"),
      behindUtilities: on("behindUtilities"),
      medicalBills: on("medicalBills"),
      needsChildcare: on("needsChildcare"),
      student: on("student"),
      enrolled,
    };
  }

  function fillForm(d) {
    form.reset();
    $("#kids").innerHTML = "";
    Object.entries(d).forEach(([k, v]) => {
      if (k === "children") { v.forEach((a) => addKid(a)); return; }
      const el = form.elements[k];
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    });
  }

  function validate() {
    const err = $("#form-error");
    let msg = "";
    if (step === 0) {
      if (!form.elements.state.value) msg = "Please choose your state.";
      else if ((+form.elements.seniors.value || 0) > (+form.elements.adults.value || 1)) msg = "The number of people 65+ can't be more than the number of adults.";
      else if ($$(".kid-age").some((i) => i.value === "" || +i.value < 0 || +i.value > 18)) msg = "Please enter each child's age (0–18), or remove the empty row.";
    }
    if (step === 1) {
      const bad = ["earnedMonthly", "otherMonthly", "rentMonthly", "utilitiesMonthly"].find((k) => +form.elements[k].value < 0);
      if (bad) msg = "Amounts can't be negative.";
    }
    err.textContent = msg;
    err.hidden = !msg;
    return !msg;
  }

  // ---------- Results ----------
  function runScreen() {
    lastResult = window.Claimable.screen(readForm());
    $("#save-status").hidden = true;
    filter = "all";
    $$(".chip").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.filter === "all")));
    render();
    show("results");
    views.results.focus();
  }

  function render() {
    const { results, totals, ctx } = lastResult;
    const stateName = (D.states.find(([c]) => c === readForm().state) || [, ""])[1];
    $("#results-household").textContent = `${ctx.size}-person household · ${stateName} · ${Math.round(ctx.pct)}% of the poverty line`;

    if (totals.likelyAnnual > 0) {
      $("#results-title").textContent = `You may be leaving about ${money(totals.likelyAnnual)} a year on the table.`;
    } else if (totals.likelyCount > 0) {
      $("#results-title").textContent = `You may qualify for ${totals.likelyCount} program${totals.likelyCount > 1 ? "s" : ""}.`;
    } else {
      $("#results-title").textContent = "We didn't find strong matches, but check the list below.";
    }
    const parts = [`${totals.likelyCount} likely match${totals.likelyCount === 1 ? "" : "es"}`];
    if (totals.maybeCount) parts.push(`${totals.maybeCount} more worth checking${totals.maybeAnnual ? ` (up to ${money(totals.maybeAnnual)} more)` : ""}`);
    $("#results-sub").textContent = parts.join(", ") + ". Estimates only; the dollar total counts food, cash, and tax credits, not health coverage.";

    const pass = (r) => filter === "all" ||
      (filter === "other" ? !["Food", "Taxes", "Health", "Utilities"].includes(r.category) : r.category === filter);
    const by = (s) => results.filter((r) => r.status === s);

    fillList("#list-likely", by("likely").filter(pass), "No likely matches in this category.");
    fillList("#list-maybe", by("maybe").filter(pass), "Nothing here.");
    fillList("#list-enrolled", by("enrolled"), "None.", true);
    fillList("#list-unlikely", by("unlikely"), "None.", true);
    $("#count-enrolled").textContent = by("enrolled").length;
    $("#count-unlikely").textContent = by("unlikely").length;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fillList(sel, items, emptyMsg, compact) {
    const el = $(sel);
    if (!items.length) { el.innerHTML = `<p class="empty">${emptyMsg}</p>`; return; }
    el.innerHTML = items.map((r) => card(r, compact)).join("");
  }

  function card(r, compact) {
    const why = r.reasons.length ? `<ul class="why">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    if (compact) {
      return `<article class="card ${r.status}"><div class="card-head"><div><span class="tag">${esc(r.category)}</span><h3>${esc(r.name)}</h3></div></div>${why}</article>`;
    }
    return `<article class="card ${r.status}" aria-label="${esc(r.name)}">
      <div class="card-head">
        <div><span class="tag">${esc(r.category)}</span><h3>${esc(r.name)}</h3></div>
        ${r.valueLabel ? `<div class="value">${esc(r.valueLabel)}</div>` : ""}
      </div>
      <p class="blurb">${esc(r.blurb)}</p>
      <p class="label-like small" style="margin:8px 0 2px">Why we think so</p>
      ${why}
      <details><summary>What to bring</summary><ul class="docs">${r.docs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>
      <div class="card-foot">
        <a class="btn btn-primary" href="${esc(r.apply.url)}" target="_blank" rel="noopener">${esc(r.apply.label)} ↗</a>
        <a class="source" href="${esc(r.source.url)}" target="_blank" rel="noopener">Source: ${esc(r.source.label)}</a>
      </div>
    </article>`;
  }

  // ---------- Read aloud ----------
  function toggleSpeech() {
    if (!("speechSynthesis" in window)) { alert("Read-aloud isn't supported in this browser."); return; }
    if (speechSynthesis.speaking) { stopSpeech(); return; }
    const { results } = lastResult;
    const lines = [$("#results-title").textContent, $("#results-sub").textContent];
    results.filter((r) => r.status === "likely").forEach((r) => {
      lines.push(`${r.name}. ${r.valueLabel}. ${r.reasons.join(" ")}`);
    });
    const u = new SpeechSynthesisUtterance(lines.join(" \n"));
    u.rate = 0.95;
    u.onend = () => ($("#read").textContent = "🔊 Read results aloud");
    $("#read").textContent = "⏹ Stop reading";
    speechSynthesis.speak(u);
  }
  function stopSpeech() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    $("#read").textContent = "🔊 Read results aloud";
  }

  init();
})();
