// Chrome serializes each of these functions into the active tab's isolated world.
// Keep each one self-contained. The caller supplies only fixed keys and numbers.
export function readReviewedAnswers(expectedOrigin) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (location.origin !== expectedOrigin || !(location.protocol === "https:" || (local && location.protocol === "http:")) ||
      /(^|\.)yourtexasbenefits\.com$/i.test(location.hostname)) return null;
  const visible = el => el.getClientRects().length && getComputedStyle(el).visibility === "visible" &&
    !el.closest('[hidden], [inert], [aria-hidden="true"]');
  const panels = [...document.querySelectorAll('[data-claimable-reviewed="texas-snap"]')].filter(visible);
  if (panels.length !== 1) return null;
  const answers = {};
  for (const el of panels[0].querySelectorAll("[data-answer-key]")) {
    if (!visible(el)) continue;
    const key = el.dataset.answerKey;
    const value = el.textContent.trim();
    if (!["householdSize", "rentMonthly", "utilitiesMonthly"].includes(key) || Object.hasOwn(answers, key)) return null;
    const format = key === "householdSize" ? /^[1-9]\d*$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
    if (!format.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100))) return null;
    answers[key] = value;
  }
  return Object.keys(answers).length ? answers : null;
}

export function fillReviewedAnswers(answers, selectedKey, expiresAt) {
  if (window !== window.top || !["https://yourtexasbenefits.com", "https://www.yourtexasbenefits.com"].includes(location.origin)) {
    return "Open the official Your Texas Benefits application first.";
  }
  if (!(expiresAt > Date.now())) return "Your answers expired. Review them again in Claimable.";

  const names = { householdSize: "household size", rentMonthly: "monthly rent", utilitiesMonthly: "monthly utilities" };
  // Match complete questions. Extra qualifiers can change whose cost, period, or
  // household the agency is asking about. Unknown wording stays with the applicant.
  const labels = {
    householdSize: /^(?:household size|number of (?:people|persons|members) in (?:your|the) household|how many (?:people|persons) (?:live|are) in (?:your|the) household|tamaño del hogar|cuántas personas (?:viven|hay) en (?:su|el) hogar)$/,
    rentMonthly: /^(?:monthly rent(?: amount)?|rent (?:per month|each month|monthly)|how much (?:rent do you pay|do you pay (?:in|for) rent) (?:each|per) month|(?:renta|alquiler) mensual)$/,
    utilitiesMonthly: /^(?:(?:total )?monthly utilit(?:y costs|ies)(?: amount)?|utilities (?:per month|each month|monthly)|how much do you pay (?:in|for) utilities (?:each|per) month|(?:gastos mensuales (?:en|de)|total mensual de) servicios (?:públicos|básicos))$/,
  };
  function repeatedQuestion(input) {
    if (input.closest('tr, li, [role="row"], [ng-repeat], [data-ng-repeat], [data-repeat], [data-index]')) return true;
    const legends = [];
    for (let section = input.closest("fieldset"); section; section = section.parentElement?.closest("fieldset")) {
      legends.push(section.querySelector(":scope > legend")?.textContent || "");
    }
    return /\b(person|member|dependent|landlord|roommate|applicant \d+|expense \d+|persona|miembro)\b/i.test(legends.join(" "));
  }
  function recognizedKey(input) {
    if (!(input instanceof HTMLInputElement) || !["text", "number"].includes(input.type) ||
        !input.getClientRects().length || getComputedStyle(input).visibility !== "visible" ||
        input.closest('[inert], [hidden], [aria-hidden="true"]')) return null;
    const nameRefs = (input.getAttribute("aria-labelledby") || "").split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || "").join(" ").trim();
    const ariaName = input.getAttribute("aria-label") || "";
    const nativeName = [...input.labels].map(el => el.textContent).join(" ");
    const clean = s => s.trim().toLowerCase().replace(/[¿?*():$]/g, " ").replace(/\s+/g, " ").trim();
    const label = clean(nameRefs || ariaName || nativeName);
    const identity = [label, input.name, input.id, input.autocomplete].join(" ");
    if (/ssn|social.?security|password|passcode|username|one.time|birth|account|email|phone|signature|seguro.social|nacimiento|cuenta|tax.?id/i.test(identity) ||
        (input.autocomplete && !["off", "on"].includes(input.autocomplete))) return null;
    for (const [key, match] of Object.entries(labels)) {
      if (match.test(label)) return key;
    }
    return null;
  }
  function enter(input, value, key) {
    if (repeatedQuestion(input) || input.matches(":disabled") || input.readOnly || input.value !== "" || input.validity.badInput) return false;
    const format = key === "householdSize" ? /^[1-9]\d*$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
    if (typeof value !== "string" || !format.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100))) return false;
    const probe = input.cloneNode(false);
    probe.value = value;
    if (probe.value !== value || !probe.validity.valid || (input.maxLength >= 0 && value.length > input.maxLength)) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (selectedKey !== null) {
    const input = document.activeElement;
    if (!Object.hasOwn(names, selectedKey) || recognizedKey(input) !== selectedKey) {
      return "Click the matching field in the application, then reopen Claimable. Unrecognized questions need manual entry.";
    }
    return enter(input, answers[selectedKey], selectedKey)
      ? "Answer entered. Review it on the agency form."
      : "The field already contains an answer or cannot accept this value. Review it on the form.";
  }
  const filled = [], skipped = [];
  for (const [key, value] of Object.entries(answers)) {
    if (!Object.hasOwn(names, key)) continue;
    // Re-read the DOM after every edit. Agency forms can replace other controls.
    const matches = [...document.querySelectorAll("input")].filter(input => recognizedKey(input) === key);
    if (matches.length === 1 && enter(matches[0], value, key)) filled.push(names[key]);
    else skipped.push(names[key]);
  }
  return (filled.length ? "Entered " + filled.join(", ") + ". Review the form." : "No matching blank fields filled.") +
    (skipped.length ? " Skipped " + skipped.join(", ") + "." : "");
}
