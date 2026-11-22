import { readReviewedAnswers, fillReviewedAnswers } from "./fields.js";
import { currentDraft, saveDraft, clearDraft } from "./draft.js";

const titles = { householdSize: "Household size", rentMonthly: "Monthly rent", utilitiesMonthly: "Monthly utilities" };
const instructions = document.getElementById("instructions");
const status = document.getElementById("status");
const actions = document.getElementById("actions");
const clear = document.getElementById("clear");
const agencyOrigins = ["https://yourtexasbenefits.com", "https://www.yourtexasbenefits.com"];
let tab;

function action(id, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.textContent = label;
  actions.append(button);
  button.addEventListener("click", async () => {
    const controls = [...document.querySelectorAll("button")];
    controls.forEach(b => { b.disabled = true; });
    try {
      await onClick();
    } catch {
      status.textContent = "Reopen Claimable on the current page. You can also copy a reviewed answer from the Claimable website.";
    } finally {
      controls.forEach(b => { b.disabled = false; });
    }
  });
  return button;
}

async function runOnTab(func, args) {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active || active.id !== tab.id || !active.url || new URL(active.url).origin !== new URL(tab.url).origin) throw new Error("Tab changed");
  const [frame] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return frame.result;
}

async function render() {
  actions.replaceChildren();
  const draft = await currentDraft();
  clear.hidden = !draft;
  [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url) {
    instructions.textContent = "Open Claimable on your screening results or open Your Texas Benefits, then use the extension there.";
    return;
  }
  const url = new URL(tab.url);
  if (agencyOrigins.includes(url.origin)) {
    if (!draft) {
      instructions.textContent = "Review your numbers on Claimable and select Use reviewed answers there first.";
      return;
    }
    instructions.textContent = "On your own SNAP application, fill matching blank fields on this page. For one answer, click its field on the form and reopen this popup.";
    async function place(key) {
      const latest = await currentDraft();
      if (!latest || latest.expiresAt !== draft.expiresAt) {
        await render();
        status.textContent = "The saved answers changed or expired. Check your selection again.";
        return;
      }
      status.textContent = await runOnTab(fillReviewedAnswers, [latest.answers, key, latest.expiresAt]);
    }
    action("fill-matching", "Fill matching fields on this page", () => place(null));
    for (const [key, value] of Object.entries(draft.answers)) {
      if (Object.hasOwn(titles, key)) action("fill-" + key, titles[key] + " · " + value, () => place(key)).dataset.key = key;
    }
    return;
  }
  if (/^https?:$/.test(url.protocol) && (url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) &&
      !/(^|\.)yourtexasbenefits\.com$/i.test(url.hostname)) {
    instructions.textContent = "On your confirmed Claimable review at " + url.host + ", save the selected numbers to this browser for the next 15 minutes.";
    action("capture", "Use reviewed answers", async () => {
      const answers = await runOnTab(readReviewedAnswers, [url.origin]);
      if (!answers) {
        await clearDraft();
        clear.hidden = true;
        status.textContent = "Confirm the live Texas SNAP answers on Claimable first, then reopen this popup.";
        return;
      }
      await saveDraft(answers);
      clear.hidden = false;
      status.textContent = "Saved " + Object.entries(answers).map(([k, v]) => titles[k] + " " + v).join(", ") +
        ". Open Your Texas Benefits from Claimable, navigate to your SNAP application, and reopen this extension.";
    });
  } else {
    instructions.textContent = "Visit your Claimable review page over HTTPS or on localhost.";
  }
}

clear.addEventListener("click", async () => {
  await clearDraft();
  await render();
  status.textContent = "Saved answers cleared.";
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.texasDraft && !changes.texasDraft.newValue) {
    actions.replaceChildren();
    clear.hidden = true;
    status.textContent = "Saved answers cleared.";
    render().catch(() => { instructions.textContent = "Reopen the extension on the current page."; });
  }
});
render().catch(() => { status.textContent = "Open the extension from Claimable or Your Texas Benefits."; });
