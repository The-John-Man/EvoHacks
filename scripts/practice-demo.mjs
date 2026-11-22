import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startPracticeServer } from "./practice-server.mjs";

// Play both roles locally: the provider owns Chrome, and the passive reviewer
// connects only after the real MCP client has filled the form and disconnected.
export async function runPracticeDemo(preparePracticeApplication) {
  const profile = await mkdtemp(join(tmpdir(), "claimable-practice-"));
  let site;
  let owner;
  let reviewer;
  try {
    site = await startPracticeServer();
    owner = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CLAIMABLE_CHROME_PATH || undefined,
      headless: true,
      args: ["--remote-debugging-port=0"],
    });
    const port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
    const endpoint = "http://127.0.0.1:" + port;
    const draft = { origin: site.origin, cdpEndpoint: endpoint };
    const complete = await preparePracticeApplication({
      ...draft, answers: { householdSize: 3, rentMonthly: 1100, utilitiesMonthly: 180 },
    });
    assert.deepEqual(complete.filled, ["householdSize", "rentMonthly", "utilitiesMonthly"]);
    assert.equal(await owner.pages()[0].evaluate(() => sessionStorage.getItem("claimable-practice-release")), null);
    const release = { sessionId: "4b572f20-7374-4bdb-966d-b7463f9f36a1", ticket: "fictional-release-ticket" };
    const partial = await preparePracticeApplication({
      ...draft, release, answers: { householdSize: 3, rentMonthly: 0 },
    });
    assert.deepEqual(partial.filled, ["householdSize", "rentMonthly"]);

    reviewer = await chromium.connectOverCDP(endpoint);
    const [page] = reviewer.contexts()[0].pages();
    assert.equal(page.url(), site.origin + "/practice/");
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("claimable-practice-release"))), release);
    assert.equal(await page.locator("#householdSize").inputValue(), "3");
    assert.equal(await page.locator("#rentMonthly").inputValue(), "0");
    assert.equal(await page.locator("#utilitiesMonthly").inputValue(), "");
    assert.equal(await page.locator("#review").isHidden(), true);
    // The provider viewer forwards taps from a phone, without a mobile keyboard.
    await page.getByLabel("Monthly rent", { exact: true }).click();
    const keypad = page.getByRole("group", { name: "Number pad" });
    for (const key of ["Clear", "1", "0", "2", "5", "Decimal point", "5", "0"]) {
      await keypad.getByRole("button", { name: key, exact: true }).click();
    }
    await page.getByRole("button", { name: "Review answers" }).click();
    assert.equal(await page.locator('[data-answer="rentMonthly"]').innerText(), "$1,025.50");
    assert.equal(await page.locator('[data-answer="utilitiesMonthly"]').innerText(), "Left blank");
    const endRequests = [];
    await page.route(site.origin + "/api/review?*", async route => {
      const request = route.request();
      endRequests.push({
        method: request.method(),
        query: [...new URL(request.url()).searchParams],
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
      });
      await route.fulfill({ status: 204 });
    });
    await page.getByRole("button", { name: "Finish practice" }).click();
    await page.getByText("Your hosted practice session has ended.", { exact: true }).waitFor();
    assert.deepEqual(endRequests, [{
      method: "POST", query: [["id", release.sessionId]], body: { ticket: release.ticket }, authorization: undefined,
    }]);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("claimable-practice-release")), null);
    console.log("Practice handoff passed: the reviewer reopened the draft, edited rent using the keypad, reviewed it, and ended the session.");
  } finally {
    try {
      await reviewer?.close();
      await owner?.close();
    } finally {
      await site?.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
