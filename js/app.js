(function () {
  "use strict";

  const D = window.ClaimableData;
  const CAData = window.ClaimableCAData;
  const MXData = window.ClaimableMXData;
  const Countries = window.ClaimableCountries;
  const I18n = window.ClaimableI18n;
  const { t } = I18n;
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
  let lastAnswers = null;
  let tracking = {};
  const unsavedTimelines = new WeakSet();
  let exampleTracking = {};
  const closedTimelines = new Set();
  let selectedCountry = "US";
  let activeExample = null;
  let initialIntake;

  const DEMOS = {
    US: [
      {
        labelKey: "demoMaria",
        data: { state: "TX", adults: 1, seniors: 0, adultWorkingAge: true, children: [3, 8], earnedMonthly: 2100, otherMonthly: 0, rentMonthly: 1100, utilitiesMonthly: 180, housing: "rent", insurance: "none", paysEnergy: true, needsChildcare: true },
      },
      {
        labelKey: "demoJames",
        data: { state: "OH", adults: 2, seniors: 0, married: true, adultWorkingAge: true, children: [1, 6, 11], earnedMonthly: 3800, otherMonthly: 0, rentMonthly: 1350, utilitiesMonthly: 240, housing: "rent", insurance: "employer", paysEnergy: true, behindUtilities: true, enrolled: { medicaid: true } },
      },
      {
        labelKey: "demoDorothy",
        data: { state: "FL", adults: 1, seniors: 1, adultWorkingAge: false, children: [], earnedMonthly: 0, otherMonthly: 1150, rentMonthly: 0, utilitiesMonthly: 210, housing: "own", insurance: "other", paysEnergy: true, medicalBills: true },
      },
      {
        labelKey: "demoAlex",
        data: { state: "CA", adults: 1, seniors: 0, adultWorkingAge: true, children: [], earnedMonthly: 1400, otherMonthly: 0, rentMonthly: 900, utilitiesMonthly: 60, housing: "rent", insurance: "none", paysEnergy: false, student: true },
      },
    ],
    CA: [
      {
        labelKey: "demoAisha",
        data: { province: "ON", adults: 1, seniors: 0, applicantAge: 34, children: [4, 9], married: false, primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen", legalStatusOk: true, afniAnnual: 32000, afniUnknown: false },
      },
      {
        labelKey: "demoMarc",
        data: { province: "QC", adults: 1, seniors: 0, applicantAge: 38, children: [7], primaryCaregiver: true, taxResident: true, eligibleStatus: "citizen", sharedCustody: true, legalStatusOk: true, afniAnnual: 55000 },
      },
      {
        labelKey: "demoHelen",
        data: { province: "BC", adults: 1, seniors: 1, applicantAge: 72, children: [], taxResident: true, legalStatusOk: true, yearsInCanadaAfter18: 35, afniAnnual: 4000, afniUnknown: false },
      },
    ],
    MX: [
      {
        labelKey: "demoRosa",
        data: { entity: "CMX", adults: 1, seniors: 1, applicantAge: 66, gender: "female", mexicanNational: true, residesInMexico: true, children: [] },
      },
      {
        labelKey: "demoCarmen",
        data: { entity: "JAL", adults: 1, seniors: 0, applicantAge: 62, gender: "female", mexicanNational: true, residesInMexico: true, children: [] },
      },
      {
        labelKey: "demoDiego",
        data: { entity: "NLE", adults: 1, seniors: 0, applicantAge: 22, gender: "male", mexicanNational: true, residesInMexico: true, children: [], working: false, studying: false },
      },
    ],
  };

  function money(n, currency) {
    if (currency === "CAD") return "CA$" + Math.round(n).toLocaleString("en-CA");
    if (currency === "MXN") return "$" + Math.round(n).toLocaleString("es-MX") + " MXN";
    return "$" + Math.round(n).toLocaleString("en-US");
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
    $$("[data-example-number]").forEach((input) => {
      input.placeholder = t("exampleNumber", { n: input.dataset.exampleNumber });
    });
    updateCoverageNote();
    updateDisclaimer();
    refreshDemos();
    updateStepLabels();
    $("#state").options[0].textContent = t("chooseState");
    $("#province").options[0].textContent = t("chooseProvince");
    $("#entity").options[0].textContent = t("chooseEntity");
    refreshAuthUI();
    render();
  }

  function updateCoverageNote() {
    const n = Countries.programCounts[selectedCountry] || 0;
    $("#coverage-note").textContent = t("coverageNote", { n });
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

  function intakeSignature() {
    return JSON.stringify([Array.from(new FormData(form)), $$(".kid-age").map((el) => el.value)]);
  }

  function clearIntake() {
    clearFormError();
    form.reset();
    $("#kids").innerHTML = "";
    kidId = 0;
    lastResult = null;
    lastAnswers = null;
    activeExample = null;
    stopSpeech();
    syncUnknownIncomeFields();
    initialIntake = intakeSignature();
  }

  function setCountry(code, { confirmClear = false } = {}) {
    const next = Countries.normalizeCountry(code) || "US";
    if (next === selectedCountry) return;
    if (confirmClear && initialIntake !== intakeSignature() && !window.confirm(t("switchCountryConfirm"))) {
      const radio = $(`input[name="country"][value="${selectedCountry}"]`);
      radio.checked = true;
      radio.focus({ preventScroll: true });
      return;
    }
    selectedCountry = next;
    $(`input[name="country"][value="${next}"]`).checked = true;
    clearIntake();
    syncCountryFields();
    updateCoverageNote();
    updateDisclaimer();
    refreshDemos();
  }

  function refreshDemos() {
    const [featured, ...others] = DEMOS[selectedCountry];
    const { results } = Countries.screen(selectedCountry, featured.data);
    const match = results.find((r) => r.status === "likely" && r.reasons.length && r.docs.length)
      || results.find((r) => r.status === "maybe" && r.reasons.length && r.docs.length);
    $(".preview-stage").hidden = !match;
    if (match) {
      $("#preview-household").textContent = t("example" + selectedCountry);
      $("#preview-status").textContent = t(match.status === "likely" ? "likelyTitle" : "maybeTitle");
      $("#preview-name").textContent = match.name;
      $("#preview-value").textContent = match.valueLabel;
      $("#preview-reason").textContent = match.reasons[0];
      $("#preview-document").textContent = match.docs[0];
      const lang = selectedCountry === "MX" ? "es" : "en";
      ["#preview-name", "#preview-value", "#preview-reason", "#preview-document"].forEach((id) => { $(id).lang = lang; });
    }
    const examples = match ? others : DEMOS[selectedCountry];
    $("#demo-list").innerHTML = examples.map((d, i) =>
      `<button type="button" class="demo-btn" data-demo="${match ? i + 1 : i}"><strong>${esc(t(d.labelKey + "Title"))}</strong><span>${esc(t(d.labelKey + "Desc"))}</span></button>`
    ).join("");
  }

  function openExample(index) {
    activeExample = DEMOS[selectedCountry][index].data;
    exampleTracking = {};
    closedTimelines.clear();
    runScreen();
  }

  function checklistAnswers() {
    return activeExample || readForm();
  }

  function checklistTracking() {
    return activeExample ? exampleTracking : tracking;
  }

  function init() {
    $("#state").innerHTML = `<option value="">${t("chooseState")}</option>` +
      D.states.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    $("#province").innerHTML = `<option value="">${t("chooseProvince")}</option>` +
      CAData.provinces.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    $("#entity").innerHTML = `<option value="">${t("chooseEntity")}</option>` +
      MXData.entities.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    syncUnknownIncomeFields();
    initialIntake = intakeSignature();

    try {
      const savedLang = localStorage.getItem("claimable-lang");
      if (savedLang && I18n.supported.includes(savedLang)) {
        I18n.setLang(savedLang);
        $("#lang-select").value = savedLang;
      }
    } catch {}
    document.documentElement.lang = I18n.getLang();

    $("#lang-select").addEventListener("change", () => {
      I18n.setLang($("#lang-select").value);
      document.documentElement.lang = I18n.getLang();
      try { localStorage.setItem("claimable-lang", I18n.getLang()); } catch {}
      applyI18n();
    });

    $$('input[name="country"]').forEach((r) => {
      r.addEventListener("change", () => setCountry(r.value, { confirmClear: true }));
    });

    $("#open-example").addEventListener("click", () => openExample(0));
    $("#demo-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-demo]");
      if (b) openExample(Number(b.dataset.demo));
    });

    $("#start").addEventListener("click", () => {
      const chosen = document.querySelector('input[name="country"]:checked');
      if (!chosen) {
        alert(t("startNeedCountry"));
        return;
      }
      setCountry(chosen.value);
      activeExample = null;
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
    form.addEventListener("input", () => {
      syncUnknownIncomeFields();
      const field = form.querySelector('[aria-invalid="true"]');
      if (!field) return;
      const messageKey = fieldError(field);
      if (messageKey) updateErrorMessage(messageKey);
      else clearFormError();
    });
    $("#edit").addEventListener("click", () => {
      if (activeExample) fillForm(activeExample);
      stopSpeech();
      show("form");
      goStep(0);
    });
    $("#print").addEventListener("click", () => window.print());
    let printDetails = [];
    window.addEventListener("beforeprint", () => {
      if (currentView !== "results" || printDetails.length) return;
      printDetails = $$(".card details:not([open])");
      printDetails.forEach((detail) => { detail.open = true; });
    });
    window.addEventListener("afterprint", () => {
      printDetails.forEach((detail) => { detail.open = false; });
      printDetails = [];
    });
    $("#read").addEventListener("click", toggleSpeech);
    $$(".chip").forEach((c) => c.addEventListener("click", () => {
      filter = c.dataset.filter;
      $$(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
      render();
    }));
    initTimelines();

    form.addEventListener("focusin", (e) => {
      if (e.target.matches('input[type="number"]')) setTimeout(() => e.target.select(), 0);
    });

    initAuth();

    const sizeBtn = $("#text-size");
    try { if (localStorage.getItem("claimable-large") === "1") setLarge(true); } catch {}
    sizeBtn.addEventListener("click", () => setLarge(!document.documentElement.classList.contains("large")));

    syncCountryFields();
    applyI18n();
  }

  function setLarge(on) {
    document.documentElement.classList.toggle("large", on);
    $("#text-size").setAttribute("aria-pressed", String(on));
    try { localStorage.setItem("claimable-large", on ? "1" : "0"); } catch {}
  }

  function show(name) {
    const returningHome = name === "intro" && currentView !== "intro";
    currentView = name;
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    window.scrollTo(0, 0);
    refreshAuthUI();
    if (returningHome) $("#intro-title").focus({ preventScroll: true });
  }

  let pendingIntent = null;
  let signInOpener = null;

  function initAuth() {
    if (!Auth.enabled) return;
    let displayedUser = Auth.user()?.userId || null;
    function syncAccount() {
      const user = Auth.user()?.userId || null;
      if (user !== displayedUser) {
        displayedUser = user;
        $("#save-status").hidden = true;
        tracking = {};
        exampleTracking = {};
        closedTimelines.clear();
        pendingIntent = null;
        signInOpener = null;
        clearIntake();
        $$("#view-results .cards").forEach((list) => list.replaceChildren());
        show("intro");
      } else {
        refreshAuthUI();
      }
    }
    Auth.onChange(syncAccount);
    window.addEventListener("pageshow", syncAccount);
    window.addEventListener("focus", syncAccount);
    $("#sign-in").addEventListener("click", (e) => openSignIn({}, e.currentTarget));
    $("#sign-out").addEventListener("click", () => Auth.signOut());
    $("#signin-cancel").addEventListener("click", () => {
      show(returnView);
      const opener = signInOpener?.isConnected ? signInOpener : $(pendingIntent?.save ? "#save" : "#sign-in");
      opener.focus();
      pendingIntent = null;
      signInOpener = null;
    });
    $("#signin-go").addEventListener("click", goToMojoAuth);
    $("#save").addEventListener("click", (e) => {
      if (Auth.user()) { saveChecklist(); return; }
      openSignIn({ save: true, answers: checklistAnswers(), tracking: checklistTracking() }, e.currentTarget);
    });
    $("#open-saved").addEventListener("click", () => {
      const saved = Auth.loadSaved();
      if (saved) openSavedChecklist(saved.answers);
    });
    $("#delete-saved").addEventListener("click", () => {
      if (!window.confirm(t("authConfirmDelete"))) return;
      tracking = {};
      exampleTracking = {};
      closedTimelines.clear();
      Auth.deleteSaved();
      render();
      showStatus("authDeleted");
      $("#save").focus();
    });
    refreshAuthUI();
    handleReturnFromLogin();
  }

  function handleReturnFromLogin() {
    const hash = window.location.hash;
    if (hash !== "#saved" && hash !== "#signed-in") return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const u = Auth.user();
    if (!u) return;
    const saved = Auth.loadSaved();
    if (hash === "#saved" && saved) {
      openSavedChecklist(saved.answers);
      showStatus("authSaved");
    }
  }

  function openSignIn(intent, opener) {
    returnView = currentView === "signin" ? returnView : currentView;
    pendingIntent = intent || {};
    signInOpener = opener;
    $("#signin-error").hidden = true;
    show("signin");
    $("#signin-title").focus({ preventScroll: true });
  }

  function goToMojoAuth() {
    const btn = $("#signin-go");
    const err = $("#signin-error");
    btn.disabled = true;
    btn.dataset.i18n = "authOpening";
    btn.textContent = t(btn.dataset.i18n);
    err.hidden = true;
    Auth.startSignIn(pendingIntent).catch((e) => {
      btn.disabled = false;
      btn.dataset.i18n = "authContinue";
      btn.textContent = t(btn.dataset.i18n);
      err.textContent = (e && e.message) || t("authUnavailable");
      err.hidden = false;
    });
  }

  function showStatus(key) {
    const status = $("#save-status");
    status.dataset.authMessage = key;
    status.textContent = t(key, { account: Auth.user()?.email || t("authAccount") });
    status.hidden = false;
  }

  function saveChecklist() {
    if (!Auth.save(checklistAnswers())) {
      showStatus("authSaveFailed");
    } else {
      const ok = saveTimelines({ ...Auth.loadTracking(), ...checklistTracking() });
      showStatus(ok ? "authSaved" : "tlSaveFailed");
    }
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
    if (saved) $("#saved-date").textContent = new Date(saved.savedAt).toLocaleDateString(I18n.speechLang(), { month: "long", day: "numeric" });
    const status = $("#save-status");
    if (!status.hidden && status.dataset.authMessage) showStatus(status.dataset.authMessage);
  }

  function openSavedChecklist(answers) {
    const country = "province" in answers ? "CA" : "entity" in answers ? "MX" : "US";
    setCountry(country);
    fillForm(answers);
    runScreen();
  }

  function updateStepLabels() {
    const educationStep = selectedCountry === "MX";
    $('.steps [data-step="1"] [data-i18n]').textContent = t(educationStep ? "intakeSchoolWork" : "stepIncome");
    steps[1].querySelector("legend").textContent = t(educationStep ? "intakeSchoolWork" : "intakeIncome");
    $("#step-count").textContent = t("intakeStep", { n: step + 1, total: steps.length });
    $("#next").textContent = t(step === steps.length - 1 ? "seeResults" : "next");
    $("#back").textContent = t(step === 0 ? "cancel" : "back");
  }

  function goStep(n) {
    step = n;
    steps.forEach((s, i) => (s.hidden = i !== n));
    $$(".steps li").forEach((li, i) => {
      li.classList.toggle("active", i === n);
      li.classList.toggle("done", i < n);
      if (i === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    updateStepLabels();
    clearFormError();
    window.scrollTo(0, 0);
    steps[n].querySelector("legend").focus({ preventScroll: true });
  }

  let kidId = 0;
  function addKid(age) {
    const id = "kid-" + kidId++;
    const row = document.createElement("div");
    row.className = "kid-row";
    row.innerHTML = `<div><label for="${id}" data-i18n="intakeChildAge">${esc(t("intakeChildAge"))}</label>
      <input id="${id}" class="kid-age" type="number" inputmode="numeric" min="0" max="18" required></div>
      <button type="button" class="btn btn-ghost" data-i18n="intakeRemove" data-i18n-aria="intakeRemoveChild"
        aria-label="${esc(t("intakeRemoveChild"))}">${esc(t("intakeRemove"))}</button>`;
    const input = row.querySelector("input");
    input.value = age ?? "";
    row.querySelector("button").addEventListener("click", () => {
      if (input.getAttribute("aria-invalid") === "true") clearFormError();
      row.remove();
      $("#add-kid").focus();
    });
    $("#kids").appendChild(row);
    if (age === undefined) input.focus();
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
    const children = $$(".kid-age").map((i) => i.valueAsNumber).filter(Number.isFinite);
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
    syncUnknownIncomeFields();
    initialIntake = intakeSignature();
  }

  function syncUnknownIncomeFields() {
    form.elements.afniAnnual.disabled = on("afniUnknown");
    form.elements.yearsInCanadaAfter18.disabled = on("yearsUnknown");
  }

  function clearFormError() {
    const previous = form.querySelector('[aria-invalid="true"]');
    if (previous) {
      previous.removeAttribute("aria-invalid");
      previous.removeAttribute("aria-errormessage");
    }
    const err = $("#form-error");
    err.hidden = true;
    delete err.dataset.i18n;
    form.querySelector(".nav").before(err);
  }

  function fieldError(field) {
    if (field.disabled) return;
    if (!field.validity.valid) {
      if (field.classList.contains("kid-age")) return field.validity.valueMissing ? "errKids" : "errChildAgeRange";
      if (field.closest(".money")) return field.validity.rangeUnderflow ? "errNegative" : "errAmount";
      return {
        state: "errState", province: "errProvince", entity: "errEntity",
        adults: "errAdultsRange", seniors: "errSeniorsRange",
        applicantAge: field.validity.valueMissing ? "errAge" : "errApplicantAgeRange",
        yearsInCanadaAfter18: "errResidenceYears"
      }[field.name];
    }
    if (field.name === "seniors" && field.valueAsNumber > form.elements.adults.valueAsNumber) return "errSeniors";
  }

  function updateErrorMessage(key) {
    const err = $("#form-error");
    if (err.dataset.i18n !== key) {
      err.dataset.i18n = key;
      err.textContent = t(key);
    }
  }

  function validate() {
    clearFormError();
    for (const field of steps[step].querySelectorAll("input, select")) {
      if (field.closest("[hidden]")) continue;
      const messageKey = fieldError(field);
      if (!messageKey) continue;
      const err = $("#form-error");
      updateErrorMessage(messageKey);
      err.hidden = false;
      (field.closest(".money") || field).after(err);
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-errormessage", err.id);
      field.focus();
      return false;
    }
    return true;
  }

  function runScreen() {
    try {
      lastAnswers = checklistAnswers();
      lastResult = Countries.screen(selectedCountry, lastAnswers);
      if (!activeExample && Auth.user()) tracking = loadTimelines();
    } catch (e) {
      $("#form-error").textContent = e.message || t("startNeedCountry");
      $("#form-error").hidden = false;
      return;
    }
    const saveStatus = $("#save-status");
    if (saveStatus) saveStatus.hidden = true;
    filter = "all";
    $$(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.filter === "all")));
    updateDisclaimer();
    render();
    show("results");
    views.results.focus({ preventScroll: true });
  }

  function placeName() {
    const h = checklistAnswers();
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
    stopSpeech();
    const { results, totals, ctx, currency } = lastResult;
    $("#results-title").textContent = t(activeExample ? "previewKicker" : "checklistTitle");
    const place = placeName();
    if (selectedCountry === "US") {
      $("#results-household").textContent = t("householdUS", { size: ctx.size, place, pct: Math.round(ctx.pct || 0) });
    } else if (selectedCountry === "CA") {
      $("#results-household").textContent = t("householdCA", { size: ctx.size, place });
    } else {
      $("#results-household").textContent = t("householdMX", { size: ctx.size, place });
    }

    const hasEstimate = totals.likelyAnnual > 0;
    $("#estimate-label").textContent = t(hasEstimate ? "checklistAnnual" : "checklistMatchCount");
    $("#estimate-value").textContent = hasEstimate ? money(totals.likelyAnnual, currency) : totals.likelyCount;
    const summary = [];
    if (hasEstimate) summary.push(t(totals.likelyCount === 1 ? "checklistOne" : "checklistMany", { n: totals.likelyCount }));
    if (totals.maybeCount) {
      summary.push(t(totals.maybeAnnual ? "checklistMaybeValue" : "checklistMaybe", {
        n: totals.maybeCount, amount: money(totals.maybeAnnual, currency)
      }));
    }
    $("#results-sub").textContent = summary.join(" · ") || t("checklistNoMaybe");

    const categories = new Set(["Food", "Taxes", "Health", "Utilities", "Children", "Seniors"]);
    const categoryFilter = ({ category }) => {
      if (category === "Childcare & school") return "Children";
      return categories.has(category) ? category : "other";
    };
    const present = new Set(results.map(categoryFilter));
    $$(".chip").forEach((chip) => {
      chip.hidden = chip.dataset.filter !== "all" && !present.has(chip.dataset.filter);
    });
    const matches = filter === "all" ? results : results.filter((r) => categoryFilter(r) === filter);
    const by = (s) => matches.filter((r) => r.status === s);
    const likely = by("likely");
    const maybe = by("maybe");
    const enrolled = by("enrolled");
    const unlikely = by("unlikely");
    $(".track-intro").hidden = likely.length + maybe.length === 0;
    fillList("#list-likely", likely, t("emptyLikely"));
    fillList("#list-maybe", maybe, t("emptyMaybe"));
    $("#count-likely").textContent = likely.length;
    $("#count-maybe").textContent = maybe.length;
    fillList("#list-enrolled", enrolled, t("none"), true);
    fillList("#list-unlikely", unlikely, t("none"), true);
    $("#count-enrolled").textContent = enrolled.length;
    $("#count-unlikely").textContent = unlikely.length;
  }

  const todayISO = () => window.ClaimableTiming.toISO(new Date());

  function fmtDay(d) {
    if (!d) return t("tlVaries");
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(I18n.speechLang(), sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  }
  const fmtRange = (a, b) => (!a ? t("tlVaries") : !b || a.getTime() === b.getTime() ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);

  function timelineBlock(r) {
    const T = window.ClaimableTiming;
    if (!T || !lastAnswers || (r.status !== "likely" && r.status !== "maybe")) return "";
    const tr = checklistTracking()[r.id] || {};
    const assumed = !tr.appliedOn;
    const isTax = selectedCountry === "US" && (r.id === "eitc" || r.id === "ctc");
    const effective = assumed && !isTax ? { ...tr, appliedOn: todayISO() } : tr;
    const household = selectedCountry === "US" ? lastAnswers : null;
    const programId = selectedCountry === "US" ? r.id : `${selectedCountry}:${r.id}`;
    const tl = T.buildTimeline(programId, household, effective, new Date(), { source: r.source });
    if (!tl) return "";
    const s = tl.summary;
    const list = (arr) => (arr && arr.length ? `<ul class="docs">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    const undated = s.basis === "unknown";

    let badge;
    if (tl.arrival && tl.arrival.received) badge = `✓ ${t("tlReceived")}`;
    else if (tl.arrival && tl.arrival.from) {
      const prefix = assumed ? t("tlEstimatedBadge") : tl.arrival.late ? t("tlLate") : t("tlExpected");
      badge = `${prefix} ${fmtRange(tl.arrival.from, tl.arrival.to)}`;
    } else badge = t("tlTimingVaries");
    const steps = tl.items.filter((it) => it.type === "step");
    const next = assumed && !isTax ? steps.find((item) => item.key === "apply") : tl.next;
    const nextTitle = next && (undated ? t(`gen_${next.key}_title`) : next.title);
    const items = steps.map((raw, i) => {
      const title = undated ? t(`gen_${raw.key}_title`) : raw.title;
      const status = assumed && raw.key === "apply" ? "now" : raw.status;
      const done = status === "done";
      const canCheck = raw.key !== "apply" && !(assumed && isTax);
      const number = `<span class="tl-number" aria-hidden="true">${done ? "&#10003;" : i + 1}</span>`;
      const marker = canCheck
        ? `<label class="tl-marker"><input type="checkbox" data-act="step" data-key="${esc(raw.key)}"
              aria-label="${esc(title)} — ${esc(t("done_" + raw.kind))}" ${done ? "checked" : ""}>${number}</label>`
        : `<span class="tl-marker">${number}</span>`;
      const alert = ["now", "late", "overdue"].includes(status) ? ` · ${esc(t("st_" + status))}` : "";
      return `<li class="tl-step s-${status}" ${next && raw.key === next.key ? 'aria-current="step"' : ""}>
        ${marker}<div class="tl-caption"><h4>${esc(title)}</h4>
        <span class="tl-date">${esc(fmtRange(raw.from, raw.to))}${alert}</span></div></li>`;
    }).join("");
    const notes = tl.items.filter((it) => it.type === "note").map((it) =>
      `<li class="tl-item k-note"><div class="tl-date">${esc(fmtDay(it.date))} · ${esc(t("tlYourUpdate"))}</div>
        <p class="tl-note-text">${esc(it.text)}</p>
        <button type="button" class="tl-del" data-act="del-note" data-index="${it.index}">${esc(t("tlRemove"))}</button></li>`
    ).join("");

    let saveLine;
    const failed = unsavedTimelines.has(tr);
    if (failed) saveLine = esc(t("tlSaveFailed"));
    else if (!Auth.enabled || activeExample) saveLine = esc(t("tlPageOnly"));
    else if (Auth.user()) saveLine = esc(t("tlSavedFor", { email: Auth.user().email || "your account" }));
    else saveLine = `${esc(t("tlNotSaved"))} <button type="button" class="linklike" data-act="signin-save">${esc(t("tlSignInSave"))}</button>`;

    const id = esc(r.id);
    return `
      <div class="tl-overview"><span class="time-badge">${esc(badge)}</span>
        ${next ? `<span><strong>${esc(t("tlNext"))}</strong> ${esc(nextTitle)} · ${esc(fmtRange(next.from, next.to))}</span>` : ""}</div>
      <details class="tl" ${closedTimelines.has(r.id) ? "" : "open"}><summary>${esc(t("tlSummary"))}</summary>
        <div class="tl-applied">
          <div><label for="ad-${id}">${esc(t("tlApplied"))}</label>
          <input type="date" id="ad-${id}" data-act="applied" value="${esc(tr.appliedOn || "")}" max="${todayISO()}"></div>
          <div class="tl-adjustments">
          ${tr.appliedOn ? `<button type="button" class="btn btn-ghost" data-act="clear">${esc(t("tlReset"))}</button>` : ""}
          ${undated ? `<p class="tl-est">${esc(t("tlUndated"))}</p>` : assumed ? `<p class="tl-est">${esc(t(isTax ? "tlEstimatedTax" : "tlEstimated"))}</p>` : ""}
          </div>
        </div>
        <div class="tl-content">
        <ol class="tl-steps" aria-label="${esc(t("tlSummary"))}">${items}</ol>
        ${notes ? `<p class="label-like small" style="margin:12px 0 6px">${esc(t("tlUpdates"))}</p><ol class="tl-list">${notes}</ol>` : ""}
        <div class="tl-foot">
          <div class="tl-source"><p class="basis">${esc(undated ? t("basis_unknown") : T.BASIS_LABEL[s.basis] || "")}</p>
          ${s.deadline ? `<p class="deadline">⚠ ${esc(s.deadline)}</p>` : ""}
          ${s.source && s.source.url ? `<a class="source" href="${esc(s.source.url)}" target="_blank" rel="noopener">${esc(t("tlSource"))} ${esc(s.source.label)}</a>` : ""}</div>
          ${s.speedUp && s.speedUp.length ? `<div class="tl-tips"><p class="label-like small" style="margin:6px 0 2px">${esc(t("tlGetFaster"))}</p>${list(undated ? [t("gen_tip")] : s.speedUp)}</div>` : ""}
          <p class="tl-save"${failed ? ' data-save-failed role="alert"' : ""}>${saveLine}</p>
        </div>
        </div>
      </details>`;
  }

  function loadTimelines() {
    const saved = Auth.loadTracking() || {};
    for (const [id, timeline] of Object.entries(tracking)) {
      if (unsavedTimelines.has(timeline)) saved[id] = timeline;
    }
    return saved;
  }

  function saveTimelines(current) {
    if (!Auth.saveTracking(current)) return false;
    if ($("#save-status").dataset.authMessage === "tlSaveFailed") $("#save-status").hidden = true;
    for (const timeline of Object.values(current)) unsavedTimelines.delete(timeline);
    for (const line of $$(".tl-save[data-save-failed]")) {
      line.removeAttribute("data-save-failed");
      line.removeAttribute("role");
      line.textContent = t("tlSavedFor", { email: Auth.user()?.email || t("authAccount") });
    }
    return true;
  }

  function updateTracking(id, fn, focusSel) {
    if (!activeExample && Auth.user()) tracking = loadTimelines();
    const current = checklistTracking();
    const tr = { done: {}, notes: [], ...(current[id] || {}) };
    fn(tr);
    current[id] = tr;
    if (!activeExample && Auth.user() && !saveTimelines(current)) unsavedTimelines.add(tr);
    refreshTimeline(id, focusSel);
  }

  function refreshTimeline(id, focusSel) {
    const el = views.results.querySelector(`article.card[data-id="${CSS.escape(id)}"]`);
    const r = lastResult && lastResult.results.find((x) => x.id === id);
    if (!el || !r) return;
    const template = document.createElement("template");
    template.innerHTML = timelineBlock(r);
    for (const selector of [".tl-overview", ".tl-adjustments", ".tl-content"]) {
      el.querySelector(selector).replaceWith(template.content.querySelector(selector));
    }
    const date = el.querySelector('[data-act="applied"]');
    const applied = template.content.querySelector('[data-act="applied"]').value;
    if (date.value !== applied) date.value = applied;
    const focusTarget = el.querySelector(focusSel);
    if (focusTarget && focusTarget !== document.activeElement) focusTarget.focus({ preventScroll: true });
  }

  function initTimelines() {
    const root = views.results;
    const idOf = (el) => { const c = el.closest && el.closest("article.card"); return c ? c.dataset.id : null; };
    root.addEventListener("toggle", (e) => {
      if (!e.target.matches || !e.target.matches("details.tl")) return;
      const id = idOf(e.target);
      if (e.target.open) closedTimelines.delete(id); else closedTimelines.add(id);
    }, true);
    root.addEventListener("change", (e) => {
      const el = e.target;
      const id = idOf(el);
      if (!id) return;
      if (el.dataset.act === "applied") {
        if (!el.validity.valid) {
          if (el.validity.rangeOverflow) el.reportValidity();
          return;
        }
        updateTracking(id, (tr) => {
          tr.appliedOn = el.value || null;
          if (!tr.appliedOn) tr.done = {};
        }, '[data-act="applied"]');
      } else if (el.dataset.act === "step") {
        updateTracking(id, (tr) => { tr.appliedOn = tr.appliedOn || todayISO(); tr.done = { ...tr.done, [el.dataset.key]: el.checked }; }, `[data-key="${el.dataset.key}"]`);
      }
    });
    root.addEventListener("click", (e) => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const id = idOf(el);
      const act = el.dataset.act;
      if (act === "clear") updateTracking(id, (tr) => { tr.appliedOn = null; tr.done = {}; }, '[data-act="applied"]');
      else if (act === "del-note") updateTracking(id, (tr) => { tr.notes = tr.notes.filter((_, i) => i !== +el.dataset.index); }, '[data-act="applied"]');
      else if (act === "signin-save") openSignIn({ save: true, answers: checklistAnswers(), tracking: checklistTracking() }, el);
    });
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
    const categoryKeys = {
      Food: "filterFood", Taxes: "filterTaxes", Health: "filterHealth", Utilities: "filterUtilities",
      Children: "filterChildren", Seniors: "filterSeniors", "Childcare & school": "categorySchool",
      "Cash help": "categoryCash", Housing: "categoryHousing", Disability: "categoryDisability",
      Education: "categoryEducation", Work: "categoryWork"
    };
    const category = esc(categoryKeys[r.category] ? t(categoryKeys[r.category]) : r.category);
    const heading = `<div><span class="tag">${category}</span><h3>${esc(r.name)}</h3></div>`;
    const source = `<a class="source" href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(t("checklistSource"))} · ${esc(r.source.label)}</a>`;
    const why = r.reasons.length ? `<ul class="why">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    if (compact) {
      return `<article class="card ${r.status}"><div class="card-head">${heading}</div>${why}<div class="card-foot">${source}</div></article>`;
    }
    const missing = (r.missingQuestions && r.missingQuestions.length)
      ? `<p class="hint small"><strong>${esc(t("checklistFollowup"))}</strong> · ${esc(r.missingQuestions.map((key) => form.elements[key]?.labels?.[0]?.textContent.trim() || key).join(", "))}</p>` : "";
    const avail = r.applicationAvailability
      ? `<p class="hint small"><strong>${esc(t("checklistAvailability"))}</strong> · ${esc(r.applicationAvailability)}</p>` : "";
    return `<article class="card ${r.status}" data-id="${esc(r.id)}" aria-label="${esc(r.name)}">
      <div class="card-head">
        ${heading}
        ${r.valueLabel ? `<div class="value">${esc(r.valueLabel)}</div>` : ""}
      </div>
      ${timelineBlock(r)}
      <p class="blurb">${esc(r.blurb)}</p>
      <p class="reasons-label">${esc(t("whyLabel"))}</p>
      ${why}
      ${missing}
      ${avail}
      <details><summary>${esc(t("docsLabel"))}</summary><ul class="docs">${r.docs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>
      <div class="card-foot">
        <a class="apply-link" href="${esc(r.apply.url)}" target="_blank" rel="noopener">${esc(r.apply.label)} <span aria-hidden="true">↗</span></a>
        ${source}
      </div>
    </article>`;
  }

  function toggleSpeech() {
    if (!("speechSynthesis" in window)) { alert(t("speechUnsupported")); return; }
    if (speechSynthesis.speaking) { stopSpeech(); return; }
    const lines = [$("#results-title").textContent, $("#results-household").textContent,
      $("#estimate-label").textContent, $("#estimate-value").textContent, $("#results-sub").textContent];
    for (const status of ["likely", "maybe"]) {
      const cards = $$("#list-" + status + " article");
      if (cards.length) lines.push(t(status + "Title"));
      for (const card of cards) {
        lines.push(...Array.from(card.querySelectorAll("h3, .value, .why li"), (el) => el.textContent));
      }
    }
    const u = new SpeechSynthesisUtterance(lines.join(" \n"));
    u.lang = I18n.speechLang();
    u.rate = 0.95;
    u.onend = () => ($("#read").textContent = t("checklistRead"));
    u.onerror = (e) => {
      $("#read").textContent = t("checklistRead");
      if (e.error !== "canceled" && e.error !== "interrupted") alert(t("speechUnsupported"));
    };
    $("#read").textContent = t("checklistStop");
    speechSynthesis.speak(u);
  }
  function stopSpeech() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if ($("#read")) $("#read").textContent = t("checklistRead");
  }

  init();
})();
