import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { startPracticeServer } from "./practice-server.mjs";

// Exercise the same route a screener user takes on a phone, with hosted review unconfigured.
const site = await startPracticeServer();
let browser;
try {
  const engine = process.argv.includes("--webkit") ? webkit : chromium;
  browser = await engine.launch(engine === chromium ? { executablePath: process.env.CLAIMABLE_CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-US" });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(site.origin);
  const language = page.getByRole("combobox", { name: "Language" });
  await language.selectOption("es");
  await page.getByRole("radio", { name: "Estados Unidos" }).waitFor();
  await language.selectOption("en");
  await page.getByText("Try an example household", { exact: true }).click();
  const acceptCountryChange = dialog => dialog.accept();
  page.on("dialog", acceptCountryChange);
  for (const [country, sample] of [["Canada", /Aisha, single parent in Ontario/], ["Mexico", /Carmen, 62, Jalisco/], ["United States", /Maria, single mom in Texas/]]) {
    await page.getByRole("radio", { name: country, exact: true }).check();
    await page.getByRole("button", { name: sample }).waitFor();
  }
  page.off("dialog", acceptCountryChange);
  await page.getByRole("button", { name: /Maria, single mom in Texas/ }).click();
  await page.getByRole("link", { name: "Try application autofill" }).click();
  await page.getByRole("heading", { name: "Choose answers to fill" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Start hosted practice" }).isVisible(), false);
  await page.getByRole("checkbox", { name: /Monthly utilities/ }).uncheck();
  await page.getByRole("button", { name: "Practice on this device" }).click();
  await page.waitForURL(url => url.pathname === "/practice/index.html", { waitUntil: "load" });
  assert.equal(await page.getByLabel("Household size").inputValue(), "3");
  assert.equal(await page.getByLabel("Monthly rent").inputValue(), "1100");
  assert.equal(await page.getByLabel("Monthly utilities").inputValue(), "");
  await page.getByLabel("Monthly rent").fill("950");
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.getByText("$950.00", { exact: true }).waitFor();
  await page.getByText("Left blank", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit answers" }).click();
  assert.equal(await page.getByLabel("Monthly rent").inputValue(), "950");
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.getByRole("button", { name: "Finish practice" }).click();
  await page.getByRole("heading", { name: "Practice complete" }).waitFor();

  // Exercise the hosted UI contract without using a provider account in CI.
  const sessionId = "a11c0000-0000-4000-8000-000000000001";
  const viewerUrl = "https://www.browserbase.com/view/fixture";
  const requests = [];
  await page.route("**/js/auth.js", route => route.fulfill({
    contentType: "application/javascript",
    body: 'window.ClaimableAuth = { enabled: true, user: () => ({userId:"fixture"}), reviewToken: async () => "fixture-id-token" };',
  }));
  await page.route(viewerUrl, route => route.fulfill({ contentType: "text/html", body: "<p>Practice viewer</p>" }));
  await page.route("**/api/review*", route => {
    const request = route.request();
    const method = request.method();
    const id = new URL(request.url()).searchParams.get("id");
    if (method === "GET" && !id) return route.fulfill({ json: { available: true } });
    requests.push({ method, id, auth: request.headers().authorization, body: request.postDataJSON() });
    if (method === "DELETE") return route.fulfill({ status: 204 });
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: {
      sessionId, viewerUrl, expiresAt: new Date(Date.now() + 600000).toISOString(),
    } });
  });
  await page.goto(site.origin + "/apply");
  await page.getByRole("checkbox", { name: /Monthly rent/ }).uncheck();
  await page.getByRole("button", { name: "Start hosted practice" }).click();
  const viewer = page.getByTitle("Interactive practice application");
  await viewer.waitFor();
  assert.equal(await viewer.getAttribute("src"), viewerUrl);
  await page.reload();
  await viewer.waitFor();
  assert.equal(await viewer.getAttribute("src"), viewerUrl);
  await page.getByRole("button", { name: "End hosted session" }).click();
  await viewer.waitFor({ state: "hidden" });
  assert.deepEqual(requests, [
    { method: "POST", id: null, auth: "Bearer fixture-id-token", body: { fields: { householdSize: 3, utilitiesMonthly: 180 } } },
    { method: "GET", id: sessionId, auth: "Bearer fixture-id-token", body: null },
    { method: "DELETE", id: sessionId, auth: "Bearer fixture-id-token", body: null },
  ]);
  assert.deepEqual(errors, []);
  console.log(`Mobile ${engine.name()} passed: local practice and mocked hosted create, resume, and end.`);
} finally {
  await browser?.close();
  await site.close();
}
