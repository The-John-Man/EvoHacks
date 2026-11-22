import { currentDraft } from "./draft.js";

// A browser alarm also clears the answers if the popup is closed at expiry.
// On sleeping devices, the alarm is delivered when the browser wakes.
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === "expire-texas-draft") await currentDraft();
});
