(function () {
  "use strict";
  const form = document.getElementById("practice-form");
  const sample = window.ClaimableSample;
  const selected = new URLSearchParams(location.hash.slice(1)).getAll("field");
  for (const key of selected) {
    if (Object.hasOwn(sample, key)) form.elements[key].value = sample[key];
  }

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const storageKey = "claimable-practice-release";
  function hostedRelease() {
    try {
      const release = JSON.parse(sessionStorage.getItem(storageKey));
      if (typeof release?.ticket === "string" && release.ticket.trim() &&
          typeof release.sessionId === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(release.sessionId)) return release;
    } catch { /* On-device practice works without session storage. */ }
    return null;
  }

  // A streamed desktop browser cannot open an iPhone's native number keyboard.
  const pad = document.getElementById("practice-keypad");
  const readout = document.getElementById("keypad-value");
  let field;
  let digits;
  function updateReadout() {
    readout.textContent = field.labels[0].textContent + " · " + (digits || "Blank");
  }
  function selectField(event) {
    if (event.target.type !== "number" || !hostedRelease()) return;
    field = event.target;
    digits = field.value;
    pad.hidden = false;
    pad.querySelector('[data-key="."]').disabled = field.step === "1";
    updateReadout();
  }
  form.addEventListener("focusin", selectField);
  form.addEventListener("click", selectField);
  form.addEventListener("input", (event) => {
    if (field === event.target) { digits = field.value; updateReadout(); }
  });
  for (const key of ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "Backspace", "Clear"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tool";
    button.dataset.key = key;
    button.textContent = key === "Backspace" ? "⌫" : key;
    if (key === "." || key === "Backspace") button.setAttribute("aria-label", key === "." ? "Decimal point" : key);
    pad.querySelector(".keypad-keys").append(button);
  }
  pad.addEventListener("click", (event) => {
    const key = event.target.dataset.key;
    if (!field || !key) return;
    if (key === "Clear") digits = "";
    else if (key === "Backspace") digits = digits.slice(0, -1);
    else if (key === ".") {
      if (!digits.includes(".")) digits = (digits || "0") + ".";
    } else digits += key;
    // A trailing decimal point is a valid intermediate edit, but not an HTML number value.
    field.value = digits.replace(/\.$/, "");
    updateReadout();
  });

  function show(id) {
    for (const key of ["entry", "review", "done"]) document.getElementById(key).hidden = key !== id;
    (id === "entry" ? form.elements.householdSize : document.querySelector("#" + id + " h1")).focus();
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    for (const target of document.querySelectorAll("[data-answer]")) {
      const key = target.dataset.answer;
      const value = form.elements[key].value;
      target.textContent = value === "" ? "Left blank" : key === "householdSize" ? value : usd.format(Number(value));
    }
    show("review");
  });
  document.getElementById("edit").addEventListener("click", () => show("entry"));
  document.getElementById("finish").addEventListener("click", async () => {
    show("done");
    const release = hostedRelease();
    if (!release) return;

    const status = document.getElementById("completion-status");
    document.getElementById("restart").hidden = true;
    status.textContent = "Closing the hosted practice browser…";
    try {
      const url = new URL("/api/review", location.origin);
      url.searchParams.set("id", release.sessionId);
      const response = await fetch(url, {
        method: "POST", credentials: "omit", redirect: "error", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: release.ticket }),
      });
      if (!response.ok) throw new Error();
    } catch {
      status.textContent = "Use End hosted session below the viewer to close the practice browser.";
      return;
    }
    status.textContent = "Your hosted practice session has ended.";
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage may have become unavailable. */ }
  });
  document.getElementById("restart").addEventListener("click", () => {
    form.reset();
    show("entry");
  });
})();
