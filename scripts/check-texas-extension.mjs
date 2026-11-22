import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const reviewUrl = "https://claimable.example/apply/texas/";
const agencyUrl = "https://www.yourtexasbenefits.com/test-fixture";
const foreignUrl = "https://unrelated.example/test-fixture";
const answers = { householdSize: "4", rentMonthly: "1267.50", utilitiesMonthly: "0" };
const review = `<main data-claimable-reviewed="texas-snap">
  <span data-answer-key="householdSize">4</span><span data-answer-key="rentMonthly">1267.50</span>
  <span data-answer-key="utilitiesMonthly">0</span><span data-answer-key="rentMonthly" hidden>999</span>
</main>`;
const application = `<form>
  <label>Household size<input type="number" id="people"></label>
  <label>Monthly rent<input type="number" step=".01" id="rent"></label>
  <label>Monthly utilities<input type="number" id="utilityA"></label>
  <label>Monthly utilities<input type="number" id="utilityB"></label>
  <label>Monthly rent<input type="password" id="credential"></label>
  <label>Annual income<input type="number" id="income"></label>
  <button>Submit application</button>
</form><script>
  window.events = [];
  for (const kind of ["input","change","submit"]) document.addEventListener(kind, event => {
    window.events.push(event.type + ":" + event.target.id);
    if (kind === "submit") event.preventDefault();
  });
</script>`;

async function until(description, task) {
  const deadline = Date.now() + 5000;
  do {
    const result = await task();
    if (result) return result;
    await delay(30);
  } while (Date.now() < deadline);
  throw new Error("Timed out waiting for " + description);
}

const context = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true, ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging", "--host-resolver-rules=MAP * ~NOTFOUND"],
});
try {
  // Fulfill all HTTP(S) requests in memory. Neither the agency nor a hosting service receives a request.
  const fixtures = new Map([[reviewUrl, review], [agencyUrl, application], [foreignUrl, application]]);
  await context.route(/^https?:/, route => fixtures.has(route.request().url())
    ? route.fulfill({ contentType: "text/html", body: fixtures.get(route.request().url()) })
    : route.abort());
  const page = context.pages()[0];
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: fileURLToPath(new URL("../extensions/texas-snap/", import.meta.url)),
  });
  const popupUrl = "chrome-extension://" + id + "/popup.html";
  let sequence = 0;

  // The toolbar popup has its own CDP target and isn't a Playwright tab. Triggering the real
  // toolbar action also exercises the extension's activeTab permission grant.
  async function usePopup(run) {
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
    const tab = targetInfos.find(target => target.url === page.url());
    await cdp.send("Extensions.triggerAction", { id, targetId: tab.targetId });
    const target = await until("toolbar popup", async () => {
      const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "page" }] });
      return targetInfos.find(info => info.url === popupUrl);
    });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: false });
    async function evaluate(expression) {
      const requestId = ++sequence;
      let listener;
      let timer;
      const result = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Toolbar popup stopped responding")), 5000);
        listener = event => {
          if (event.sessionId !== sessionId) return;
          const packet = JSON.parse(event.message);
          if (packet.id !== requestId) return;
          if (packet.error || packet.result?.exceptionDetails) reject(new Error(JSON.stringify(packet)));
          else resolve(packet.result.result.value);
        };
        cdp.on("Target.receivedMessageFromTarget", listener);
      });
      try {
        const message = JSON.stringify({ id: requestId, method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true } });
        await cdp.send("Target.sendMessageToTarget", { sessionId, message });
        return await result;
      } finally {
        clearTimeout(timer);
        cdp.off("Target.receivedMessageFromTarget", listener);
      }
    }
    async function click(selector) {
      const control = "document.querySelector(" + JSON.stringify(selector) + ")";
      await until("enabled " + selector, () => evaluate(control + "?.getClientRects().length && !" + control + ".disabled"));
      await evaluate(control + ".click()");
    }
    const draft = () => evaluate("chrome.storage.session.get('texasDraft').then(v => v.texasDraft || null)");
    try { await run({ click, evaluate, draft }); }
    finally {
      const isOpen = async () => (await cdp.send("Target.getTargets", { filter: [{ type: "page" }] }))
        .targetInfos.some(info => info.targetId === target.targetId);
      if (await isOpen()) await cdp.send("Target.closeTarget", { targetId: target.targetId });
      await until("toolbar popup to close", async () => !(await isOpen()));
    }
  }

  await page.goto(reviewUrl);
  await usePopup(async ({ click, draft }) => {
    await click("#capture");
    assert.deepEqual((await until("saved answers", draft)).answers, answers);
  });

  await page.goto(agencyUrl);
  async function clickAndFinish(selector) {
    await usePopup(async ({ click, evaluate }) => {
      const before = await evaluate("document.querySelector('#status')?.textContent");
      await click(selector);
      await until("entry result", async () => {
        const message = await evaluate("document.querySelector('#status').textContent");
        return message && message !== before;
      });
    });
  }
  for (const field of ["credential", "income"]) {
    await page.locator("#" + field).focus();
    await clickAndFinish('[data-key="rentMonthly"]');
    assert.equal(await page.locator("#" + field).inputValue(), "");
  }
  await page.locator("#rent").focus();
  await clickAndFinish('[data-key="rentMonthly"]');
  assert.equal(await page.locator("#rent").inputValue(), answers.rentMonthly);
  await clickAndFinish("#fill-matching");
  assert.equal(await page.locator("#people").inputValue(), answers.householdSize);
  for (const selector of ["#utilityA", "#utilityB", "#credential", "#income"]) {
    assert.equal(await page.locator(selector).inputValue(), "");
  }
  assert.deepEqual(await page.evaluate(() => window.events), ["input:rent", "change:rent", "input:people", "change:people"]);

  await page.goto(foreignUrl);
  await page.locator("#rent").focus();
  await usePopup(async ({ click, evaluate, draft }) => {
    await until("clear action", () => evaluate("document.querySelector('#clear')?.getClientRects().length"));
    assert.equal(await evaluate("document.querySelector('#fill-matching, [data-key]') === null"), true);
    await click("#clear");
    await until("draft removal", async () => (await draft()) === null);
  });
  assert.deepEqual(await page.evaluate(() => window.events), []);
  console.log("Unpacked extension passed: confirmed answers, focused and page autofill, ambiguous and protected fields, origin checks, and clearing.");
} finally {
  await context.close();
}
