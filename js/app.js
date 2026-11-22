/* Claimable — UI. Country + language selection, country intake, dispatcher, results. */
(function () {
  "use strict";

  const D = window.ClaimableData;
  const CAData = window.ClaimableCAData;
  const MXData = window.ClaimableMXData;
  const Countries = window.ClaimableCountries;
  const I18n = window.ClaimableI18n;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const views = { intro: $("#view-intro"), signin: $("#view-signin"), form: $("#view-form"), results: $("#view-results") };
  const Auth = window.ClaimableAuth || { enabled: false, user: () => null, onChange() {}, loadSaved: () => null };
  let currentView = "intro";
  let returnView = "intro";
  const form = $("#form");
  const steps = $$(".step");
  let step = 0;
  let lastResult = null;
  let filter = "all";
  let selectedCountry = "US";
  let pendingCountry = "US";

  const DEMOS = {
    US: [
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
    ],
    CA: [
      {
        title: "Aisha, single parent in Ontario",
        desc: "2 kids (4 and 9), AFNI CA$32,000, primary caregiver, tax resident",
        data: { province: "ON", adults: 1, seniors: 0, applicantAge: 34, children: [4, 9], married: false, primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen", legalStatusOk: true, afniAnnual: 32000, afniUnknown: false },
      },
      {
        title: "Marc & Sophie, shared custody in Quebec",
        desc: "1 child (7), AFNI CA$55,000, shared custody",
        data: { province: "QC", adults: 1, seniors: 0, applicantAge: 38, children: [7], primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen", sharedCustody: true, legalStatusOk: true, afniAnnual: 55000 },
      },
      {
        title: "Helen, 72, living alone in British Columbia",
        desc: "35 years in Canada after 18, low other income, checking OAS/GIS",
        data: { province: "BC", adults: 1, seniors: 1, applicantAge: 72, children: [], taxResident: true, legalStatusOk: true, yearsInCanadaAfter18: 35, afniAnnual: 4000, afniUnknown: false },
      },
    ],
    MX: [
      {
        title: "Rosa, 66, Ciudad de México",
        desc: "Mexican nationality, lives in Mexico — pensión adultos mayores",
        data: { entity: "CMX", adults: 1, seniors: 1, applicantAge: 66, gender: "female", mexicanNational: true, residesInMexico: true, children: [] },
      },
      {
        title: "Carmen, 62, Jalisco",
        desc: "Woman aged 62 — Pensión Mujeres Bienestar",
        data: { entity: "JAL", adults: 1, seniors: 0, applicantAge: 62, gender: "female", mexicanNational: true, residesInMexico: true, children: [] },
      },
      {
        title: "Diego, 22, Nuevo León",
        desc: "Not working or studying — Jóvenes Construyendo el Futuro",
        data: { entity: "NLE", adults: 1, seniors: 0, applicantAge: 22, gender: "male", mexicanNational: true, residesInMexico: true, children: [], working: false, studying: false },
      },
    ],
  };

  function money(n, currency) {
    const cur = currency || (lastResult && lastResult.currency) || "USD";
    if (cur === "CAD") return "CA$" + Math.round(n).toLocaleString("en-CA");
    if (cur === "MXN") return "$" + Math.round(n).toLocaleString("es-MX") + " MXN";
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  function t(key, vars) {
    return I18n.t(key, vars);
  }

  function applyI18n() {
    $$("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    $$("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    $$("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    updateCoverageNote();
    updateIntroLead();
    updateDisclaimer();
    refreshDemos();
    if (lastResult) render();
  }

  function updateIntroLead() {
    const n = Countries.programCounts[selectedCountry] || 0;
    const key = selectedCountry === "CA" ? "introLeadCA" : selectedCountry === "MX" ? "introLeadMX" : "introLeadUS";
    $("#intro-lead").textContent = t(key, { n });
  }

  function updateCoverageNote() {
    const n = Countries.programCounts[selectedCountry] || 0;
    const country = t("country" + selectedCountry);
    $("#coverage-note").textContent = t("coverageNote", { n, country });
  }

  function updateDisclaimer() {
    const key = selectedCountry === "CA" ? "howCA" : selectedCountry === "MX" ? "howMX" : "howUS";
    $("#disclaimer-body").textContent = t(key);
    const asOf =
      selectedCountry === "CA" ? CAData.asOf :
      selectedCountry === "MX" ? MXData.asOf :
      D.asOf;
    $("#as-of").textContent = asOf;
  }

  function syncCountryFields() {
    $$("[data-country-fields]").forEach((el) => {
      const codes = el.getAttribute("data-country-fields").split(/\s+/);
      el.hidden = !codes.includes(selectedCountry);
    });
  }

  function clearIntake() {
    form.reset();
    $("#kids").innerHTML = "";
    kidId = 0;
    lastResult = null;
    stopSpeech();
    // restore sensible defaults after reset
    if (form.elements.adultWorkingAge) form.elements.adultWorkingAge.checked = true;
    if (form.elements.paysEnergy) form.elements.paysEnergy.checked = true;
    if (form.elements.primaryCaregiver) form.elements.primaryCaregiver.checked = true;
    if (form.elements.taxResident) form.elements.taxResident.checked = true;
    if (form.elements.legalStatusOk) form.elements.legalStatusOk.checked = true;
    if (form.elements.mexicanNational) form.elements.mexicanNational.checked = true;
    if (form.elements.residesInMexico) form.elements.residesInMexico.checked = true;
    if (form.elements.adults) form.elements.adults.value = 1;
  }

  function setCountry(code, { confirmClear = false } = {}) {
    const next = Countries.normalizeCountry(code) || "US";
    if (next === selectedCountry) {
      pendingCountry = next;
      return;
    }
    const hasAnswers = !!form.querySelector("input:checked, .kid-age") || step > 0 || lastResult;
    if (confirmClear && hasAnswers && !window.confirm(t("switchCountryConfirm"))) {
      // revert radio
      const radio = document.querySelector(`input[name="country"][value="${selectedCountry}"]`);
      if (radio) radio.checked = true;
      return;
    }
    selectedCountry = next;
    pendingCountry = next;
    clearIntake();
    syncCountryFields();
    updateCoverageNote();
    updateIntroLead();
    updateDisclaimer();
    refreshDemos();
    show("intro");
  }

  function refreshDemos() {
    const list = DEMOS[selectedCountry] || [];
    $("#demo-list").innerHTML = list.map((d, i) =>
      `<button type="button" class="demo-btn" data-demo="${i}"><strong>${esc(d.title)}</strong><span>${esc(d.desc)}</span></button>`
    ).join("");
  }

  function init() {
    $("#state").innerHTML = `<option value="">${t("chooseState")}</option>` +
      D.states.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    $("#province").innerHTML = `<option value="">${t("chooseProvince")}</option>` +
      CAData.provinces.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    $("#entity").innerHTML = `<option value="">${t("chooseEntity")}</option>` +
      MXData.entities.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");

    try {
      const savedLang = localStorage.getItem("claimable-lang");
      if (savedLang && I18n.supported.includes(savedLang)) {
        I18n.setLang(savedLang);
        $("#lang-select").value = savedLang;
      }
    } catch (_) { /* ignore */ }
    document.documentElement.lang = I18n.getLang() === "en" ? "en" : I18n.getLang();

    $("#lang-select").addEventListener("change", () => {
      I18n.setLang($("#lang-select").value);
      document.documentElement.lang = I18n.getLang();
      try { localStorage.setItem("claimable-lang", I18n.getLang()); } catch (_) { /* ignore */ }
      applyI18n();
    });

    $$('input[name="country"]').forEach((r) => {
      r.addEventListener("change", () => setCountry(r.value, { confirmClear: true }));
    });

    $("#demo-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-demo]");
      if (!b) return;
      const demo = (DEMOS[selectedCountry] || [])[+b.dataset.demo];
      if (!demo) return;
      fillForm(demo.data);
      runScreen();
    });

    $("#start").addEventListener("click", () => {
      const chosen = document.querySelector('input[name="country"]:checked');
      if (!chosen) {
        alert(t("startNeedCountry"));
        return;
      }
      setCountry(chosen.value);
      syncCountryFields();
      show("form");
      goStep(0);
    });
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

    form.addEventListener("focusin", (e) => {
      if (e.target.matches('input[type="number"]')) setTimeout(() => e.target.select(), 0);
    });

    initAuth();

    const sizeBtn = $("#text-size");
    try { if (localStorage.getItem("claimable-large") === "1") setLarge(true); } catch (_) { /* storage blocked */ }
    sizeBtn.addEventListener("click", () => setLarge(!document.documentElement.classList.contains("large")));

    syncCountryFields();
    applyI18n();
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

  // ---------- Optional sign-in (MojoAuth, OpenID Connect) ----------
  let pendingIntent = null;

  function initAuth() {
    if (!Auth.enabled) return; // no issuer/client ID configured: login stays hidden, app works as before
    Auth.onChange(refreshAuthUI);
    $("#sign-in").addEventListener("click", () => openSignIn({}));
    $("#sign-out").addEventListener("click", () => { $("#save-status").hidden = true; show("intro"); Auth.signOut(); });
    $("#signin-cancel").addEventListener("click", () => show(returnView));
    $("#signin-go").addEventListener("click", goToMojoAuth);
    $("#save").addEventListener("click", () => {
      if (Auth.user()) { saveChecklist(); return; }
      // Carry the answers through the redirect so the checklist is saved the moment they're back.
      openSignIn({ save: true, answers: readForm() });
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
    handleReturnFromLogin();
  }

  /** Back from /auth/callback: "#saved" means the checklist was saved during sign-in. */
  function handleReturnFromLogin() {
    const hash = window.location.hash;
    if (hash !== "#saved" && hash !== "#signed-in") return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const u = Auth.user();
    if (!u) return;
    const saved = Auth.loadSaved();
    if (hash === "#saved" && saved) {
      fillForm(answersToForm(saved.answers));
      runScreen();
      showStatus(`Signed in and saved for ${u.email || "your account"}. Sign in here anytime to reopen it.`);
    }
  }

  /** Show a short explainer first, so people know what's shared before leaving the site. */
  function openSignIn(intent) {
    returnView = currentView === "signin" ? returnView : currentView;
    pendingIntent = intent || {};
    $("#signin-error").hidden = true;
    show("signin");
    $("#signin-go").focus({ preventScroll: true });
  }

  function goToMojoAuth() {
    const btn = $("#signin-go");
    const err = $("#signin-error");
    btn.disabled = true;
    btn.textContent = "Opening sign-in…";
    err.hidden = true;
    Auth.startSignIn(pendingIntent).catch((e) => {
      btn.disabled = false;
      btn.textContent = "Continue to sign in";
      err.textContent = (e && e.message) || "Sign-in isn't available right now. You can keep using Claimable without an account.";
      err.hidden = false;
    });
  }

  function showStatus(text) {
    const status = $("#save-status");
    status.textContent = text;
    status.hidden = false;
  }

  function saveChecklist() {
    const u = Auth.user();
    const ok = Auth.save(readForm());
    showStatus(ok
      ? `Saved on this device for ${u.email || "your account"}. Sign in here anytime to reopen it.`
      : "Couldn't save. Your browser may be blocking storage (private mode?).");
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
    $("#next").textContent = n === steps.length - 1 ? t("seeResults") : t("next");
    $("#back").textContent = n === 0 ? t("cancel") : t("back");
    $("#form-error").hidden = true;
    window.scrollTo(0, 0);
    const focusTarget = Array.from(steps[n].querySelectorAll("select, input"))
      .find((el) => !el.closest("[hidden]"));
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

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

  function optNum(name) {
    const el = form.elements[name];
    if (!el || el.value === "" || el.value === null) return null;
    const n = parseFloat(el.value);
    return Number.isFinite(n) ? n : null;
  }

  function on(name) {
    const el = form.elements[name];
    return !!(el && el.type === "checkbox" && el.checked);
  }

  function readForm() {
    const children = $$(".kid-age").map((i) => parseInt(i.value, 10)).filter((a) => Number.isFinite(a));
    if (selectedCountry === "CA") {
      const afniUnknown = on("afniUnknown") || form.elements.afniAnnual.value === "";
      return {
        province: form.elements.province.value,
        adults: Math.max(1, Math.round(optNum("adults") || 1)),
        seniors: Math.round(optNum("seniors") || 0),
        applicantAge: optNum("applicantAge"),
        married: on("married"),
        primaryCaregiver: on("primaryCaregiver"),
        taxResident: on("taxResident"),
        sharedCustody: on("sharedCustody"),
        legalStatusOk: on("legalStatusOk"),
        eligibleStatus: form.elements.eligibleStatus.value,
        children,
        afniAnnual: afniUnknown ? null : optNum("afniAnnual"),
        afniUnknown,
        yearsInCanadaAfter18: on("yearsUnknown") ? null : optNum("yearsInCanadaAfter18"),
        yearsUnknown: on("yearsUnknown"),
        dtc: form.elements.dtc.value,
        hasDentalCoverage: on("hasDentalCoverage"),
        enrolled: {
          ccb: on("en_ccb"),
          oas: on("en_oas"),
          gis: on("en_gis"),
          cdb: on("en_cdb"),
          cdcp: on("en_cdcp"),
        },
      };
    }
    if (selectedCountry === "MX") {
      return {
        entity: form.elements.entity.value,
        adults: Math.max(1, Math.round(optNum("adults") || 1)),
        seniors: Math.round(optNum("seniors") || 0),
        applicantAge: optNum("applicantAge"),
        gender: form.elements.gender.value,
        mexicanNational: on("mexicanNational"),
        nationalityUnknown: !on("mexicanNational") && false,
        residesInMexico: on("residesInMexico"),
        disabilityCertified: on("disabilityCertified"),
        children,
        inPublicSchool: on("inPublicSchool"),
        studying: on("studying"),
        working: on("working"),
        otherScholarship: on("otherScholarship"),
        schoolLevel: form.elements.schoolLevel.value,
        enrolled: {
          pension65: on("en_pension65"),
          mujeres: on("en_mujeres"),
          disability: on("en_disability"),
          becaRita: on("en_becaRita"),
          becaBenito: on("en_becaBenito"),
          jcf: on("en_jcf"),
        },
      };
    }
    const enrolled = {};
    ["snap", "medicaid", "wic", "ssi", "tanf", "liheap", "lifeline", "schoolMeals", "housing", "headStart", "childcare"]
      .forEach((k) => (enrolled[k] = on("en_" + k)));
    return {
      state: form.elements.state.value,
      adults: Math.max(1, Math.round(optNum("adults") || 1)),
      seniors: Math.round(optNum("seniors") || 0),
      married: on("married"),
      adultWorkingAge: on("adultWorkingAge"),
      disabled: on("disabled"),
      pregnant: on("pregnant"),
      children,
      earnedMonthly: optNum("earnedMonthly") || 0,
      otherMonthly: optNum("otherMonthly") || 0,
      rentMonthly: optNum("rentMonthly") || 0,
      utilitiesMonthly: optNum("utilitiesMonthly") || 0,
      investmentOver: on("investmentOver"),
      housing: form.elements.housing.value,
      insurance: form.elements.insurance.value,
      paysEnergy: on("paysEnergy"),
      behindUtilities: on("behindUtilities"),
      medicalBills: on("medicalBills"),
      needsChildcare: on("needsChildcare"),
      student: on("student"),
      enrolled,
    };
  }

  function fillForm(d) {
    clearIntake();
    Object.entries(d).forEach(([k, v]) => {
      if (k === "children") { v.forEach((a) => addKid(a)); return; }
      if (k === "enrolled") {
        Object.entries(v).forEach(([ek, ev]) => {
          const el = form.elements["en_" + ek];
          if (el) el.checked = !!ev;
        });
        return;
      }
      const el = form.elements[k];
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!v;
      else if (v !== null && v !== undefined) el.value = v;
    });
    // enrolled flags as en_* flat keys in demos
    Object.keys(d).forEach((k) => {
      if (k.startsWith("en_")) {
        const el = form.elements[k];
        if (el) el.checked = !!d[k];
      }
    });
  }

  function validate() {
    const err = $("#form-error");
    let msg = "";
    if (step === 0) {
      if (selectedCountry === "US" && !form.elements.state.value) msg = t("errState");
      else if (selectedCountry === "CA" && !form.elements.province.value) msg = t("errProvince");
      else if (selectedCountry === "MX" && !form.elements.entity.value) msg = t("errEntity");
      else if ((+form.elements.seniors.value || 0) > (+form.elements.adults.value || 1)) msg = t("errSeniors");
      else if ($$(".kid-age").some((i) => i.value === "" || +i.value < 0 || +i.value > 18)) msg = t("errKids");
      else if ((selectedCountry === "CA" || selectedCountry === "MX") && form.elements.applicantAge.value === "") msg = t("errAge");
    }
    if (step === 1 && selectedCountry === "US") {
      const bad = ["earnedMonthly", "otherMonthly", "rentMonthly", "utilitiesMonthly"].find((k) => {
        const el = form.elements[k];
        return el && el.value !== "" && +el.value < 0;
      });
      if (bad) msg = t("errNegative");
    }
    if (step === 1 && selectedCountry === "CA") {
      if (form.elements.afniAnnual.value !== "" && +form.elements.afniAnnual.value < 0) msg = t("errNegative");
    }
    err.textContent = msg;
    err.hidden = !msg;
    return !msg;
  }

  function runScreen() {
    try {
      lastResult = Countries.screen(selectedCountry, readForm());
    } catch (e) {
      $("#form-error").textContent = e.message || t("startNeedCountry");
      $("#form-error").hidden = false;
      return;
    }
    const saveStatus = $("#save-status");
    if (saveStatus) saveStatus.hidden = true;
    filter = "all";
    $$(".chip").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.filter === "all")));
    updateDisclaimer();
    render();
    show("results");
    views.results.focus();
  }

  function placeName() {
    const h = readForm();
    if (selectedCountry === "CA") {
      return (CAData.provinces.find(([c]) => c === h.province) || [, ""])[1];
    }
    if (selectedCountry === "MX") {
      return (MXData.entities.find(([c]) => c === h.entity) || [, ""])[1];
    }
    return (D.states.find(([c]) => c === h.state) || [, ""])[1];
  }

  function render() {
    if (!lastResult) return;
    const { results, totals, ctx, currency } = lastResult;
    const place = placeName();
    if (selectedCountry === "US") {
      $("#results-household").textContent = t("householdUS", { size: ctx.size, place, pct: Math.round(ctx.pct || 0) });
    } else if (selectedCountry === "CA") {
      $("#results-household").textContent = t("householdCA", { size: ctx.size, place });
    } else {
      $("#results-household").textContent = t("householdMX", { size: ctx.size, place });
    }

    if (totals.likelyAnnual > 0) {
      $("#results-title").textContent = t("titleMoney", { money: money(totals.likelyAnnual, currency) });
    } else if (totals.likelyCount > 0) {
      $("#results-title").textContent = t("titleCount", { n: totals.likelyCount });
    } else {
      $("#results-title").textContent = t("titleNone");
    }
    const maybe = totals.maybeCount
      ? t("subMaybe", { n: totals.maybeCount }) + (totals.maybeAnnual ? ` (up to ${money(totals.maybeAnnual, currency)})` : "")
      : "";
    $("#results-sub").textContent = t("subLine", { likely: totals.likelyCount, maybe });

    const known = new Set(["Food", "Taxes", "Health", "Utilities", "Children", "Seniors"]);
    const pass = (r) => filter === "all" ||
      (filter === "other" ? !known.has(r.category) : r.category === filter);
    const by = (s) => results.filter((r) => r.status === s);

    fillList("#list-likely", by("likely").filter(pass), t("emptyLikely"));
    fillList("#list-maybe", by("maybe").filter(pass), t("emptyMaybe"));
    fillList("#list-enrolled", by("enrolled"), t("none"), true);
    fillList("#list-unlikely", by("unlikely"), t("none"), true);
    $("#count-enrolled").textContent = by("enrolled").length;
    $("#count-unlikely").textContent = by("unlikely").length;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fillList(sel, items, emptyMsg, compact) {
    const el = $(sel);
    if (!items.length) { el.innerHTML = `<p class="empty">${esc(emptyMsg)}</p>`; return; }
    el.innerHTML = items.map((r) => card(r, compact)).join("");
  }

  function card(r, compact) {
    const why = r.reasons.length ? `<ul class="why">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    const missing = (r.missingQuestions && r.missingQuestions.length)
      ? `<p class="hint small">Follow-up: ${esc(r.missingQuestions.join(", "))}</p>` : "";
    const avail = r.applicationAvailability
      ? `<p class="hint small">Application: ${esc(r.applicationAvailability)}</p>` : "";
    if (compact) {
      return `<article class="card ${r.status}"><div class="card-head"><div><span class="tag">${esc(r.category)}</span><h3>${esc(r.name)}</h3></div></div>${why}</article>`;
    }
    return `<article class="card ${r.status}" aria-label="${esc(r.name)}">
      <div class="card-head">
        <div><span class="tag">${esc(r.category)}</span><h3>${esc(r.name)}</h3></div>
        ${r.valueLabel ? `<div class="value">${esc(r.valueLabel)}</div>` : ""}
      </div>
      <p class="blurb">${esc(r.blurb)}</p>
      <p class="label-like small" style="margin:8px 0 2px">${esc(t("whyLabel"))}</p>
      ${why}
      ${missing}
      ${avail}
      <details><summary>${esc(t("docsLabel"))}</summary><ul class="docs">${r.docs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>
      <div class="card-foot">
        <a class="btn btn-primary" href="${esc(r.apply.url)}" target="_blank" rel="noopener">${esc(r.apply.label)} ↗</a>
        ${r.id === "snap" && lastResult.country === "US" && form.elements.state.value === "TX"
          ? `<a class="btn btn-ghost no-print" href="apply/index.html" hreflang="en">${esc(t("tryAutofill"))}</a>` : ""}
        <a class="source" href="${esc(r.source.url)}" target="_blank" rel="noopener">Source: ${esc(r.source.label)}</a>
      </div>
    </article>`;
  }

  function toggleSpeech() {
    if (!("speechSynthesis" in window)) { alert(t("speechUnsupported")); return; }
    if (speechSynthesis.speaking) { stopSpeech(); return; }
    const { results } = lastResult;
    const lines = [$("#results-title").textContent, $("#results-sub").textContent];
    results.filter((r) => r.status === "likely").forEach((r) => {
      lines.push(`${r.name}. ${r.valueLabel}. ${r.reasons.join(" ")}`);
    });
    const u = new SpeechSynthesisUtterance(lines.join(" \n"));
    u.lang = I18n.speechLang();
    u.rate = 0.95;
    u.onend = () => ($("#read").textContent = t("read"));
    $("#read").textContent = t("stopRead");
    speechSynthesis.speak(u);
  }
  function stopSpeech() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if ($("#read")) $("#read").textContent = t("read");
  }

  init();
})();
