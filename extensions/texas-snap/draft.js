// The popup and expiry alarm may run concurrently in different extension contexts.
const store = chrome.storage.session;
const lock = operation => navigator.locks.request("texas-draft", operation);

export function currentDraft() {
  return lock(async () => {
    const { texasDraft } = await store.get("texasDraft");
    if (texasDraft && texasDraft.expiresAt > Date.now()) return texasDraft;
    if (texasDraft) await store.remove("texasDraft");
    return null;
  });
}

export function saveDraft(answers) {
  return lock(async () => {
    const expiresAt = Date.now() + 15 * 60 * 1000;
    await chrome.alarms.create("expire-texas-draft", { when: expiresAt });
    await store.set({ texasDraft: { answers, expiresAt } });
  });
}

export function clearDraft() {
  return lock(() => store.remove("texasDraft"));
}
