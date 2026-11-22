import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import playwrightMcp from "@playwright/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const labels = {
  householdSize: "Household size",
  rentMonthly: "Monthly rent",
  utilitiesMonthly: "Monthly utilities",
};

function practiceUrl(origin) {
  const url = new URL(origin);
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid practice origin.");
  return new URL("/practice/", url).href;
}

function confirmedValues(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("Invalid answers.");
  const values = {};
  for (const [key, value] of Object.entries(answers)) {
    if (!Object.hasOwn(labels, key)) throw new Error("Unknown practice field.");
    if (value === null || value === undefined) continue;
    const valid = key === "householdSize"
      ? Number.isSafeInteger(value) && value >= 1
      : Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Number(value.toFixed(2)) === value;
    if (!valid) throw new Error("Invalid confirmed value for " + key + ".");
    values[key] = String(value);
  }
  return values;
}

// One new, exclusive provider session per request. Neither the URL to visit nor
// the MCP tool names or selectors are supplied by the applicant.
export async function preparePracticeApplication({ origin, cdpEndpoint, answers, release }) {
  const url = practiceUrl(origin);
  const values = confirmedValues(answers);
  let browser;
  let server;
  let client;
  let artifacts;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 10000 });
    const [context] = browser.contexts();
    if (!context || browser.contexts().length !== 1 || context.pages().length > 1) {
      throw new Error("Expected one dedicated browser.");
    }
    const page = context.pages()[0] || await context.newPage();
    // MCP can write browser console events even when snapshots are disabled.
    // Use the function's temporary directory and remove it when handing off.
    artifacts = await mkdtemp(join(tmpdir(), "claimable-mcp-"));
    server = await playwrightMcp.createConnection({
      browser: { isolated: false },
      outputDir: artifacts,
      webmcp: false, saveSession: false, snapshot: { mode: "none" }, codegen: "none",
      timeouts: { action: 4000, navigation: 12000 },
    }, async () => context);
    client = new Client({ name: "claimable-practice", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const navigate = await client.callTool({ name: "browser_navigate", arguments: { url } });
    if (navigate.isError) throw new Error("Navigation failed.");

    // Scope selectors to this particular verified document. A redirect, reload,
    // or replacement between checking the URL and filling loses the marker.
    const marker = randomUUID();
    const ready = await page.evaluate(({ url, marker, keys }) => {
      const form = document.getElementById("practice-form");
      if (location.href !== url || !(form instanceof HTMLFormElement)) return false;
      for (const key of keys) {
        const input = form.elements.namedItem(key);
        if (!(input instanceof HTMLInputElement) || input.id !== key || input.type !== "number" || input.value !== "") return false;
      }
      form.dataset.fillSession = marker;
      return true;
    }, { url, marker, keys: Object.keys(labels) });
    if (!ready) throw new Error("Unexpected practice form.");

    const fields = Object.entries(values).map(([key, value]) => ({
      name: labels[key], type: "textbox", value,
      target: `form[data-fill-session="${marker}"] input#${key}`,
    }));
    if (fields.length) {
      const fill = await client.callTool({ name: "browser_fill_form", arguments: { fields } });
      if (fill.isError) throw new Error("Filling failed.");
    }
    const correct = await page.evaluate(({ url, marker, keys, values, release }) => {
      const form = document.getElementById("practice-form");
      if (location.href !== url || form?.dataset.fillSession !== marker) return false;
      delete form.dataset.fillSession;
      const valid = keys.every(key => {
        const input = form.elements.namedItem(key);
        return input?.value === (values[key] ?? "") && input.validity.valid;
      });
      if (valid && release) {
        const { sessionId, ticket } = release;
        sessionStorage.setItem("claimable-practice-release", JSON.stringify({ sessionId, ticket }));
      }
      return valid;
    }, { url, marker, keys: Object.keys(labels), values, release });
    if (!correct) throw new Error("Values were not retained.");
    return { filled: Object.keys(values) };
  } catch {
    // Tool errors may contain answers or the provider's authenticated CDP URL.
    throw new Error("Could not prepare the practice form for review.");
  } finally {
    await client?.close().catch(() => {});
    await server?.close().catch(() => {});
    // Closing a connectOverCDP client disconnects it. The provider owns
    // the browser, and the applicant's page remains open for Live View.
    await browser?.close().catch(() => {});
    if (artifacts) await rm(artifacts, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { runPracticeDemo } = await import("./practice-demo.mjs");
  await runPracticeDemo(preparePracticeApplication);
}
