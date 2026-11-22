# Claimable

**Find the benefits your household is leaving on the table.**

Billions of dollars in food aid, tax credits, health coverage, and utility help go unclaimed every year:
about 1 in 5 people eligible for the EITC never claim it, 44% of people eligible for WIC aren't enrolled, and LIHEAP reaches only
about 1 in 6 eligible households. Claimable asks a few plain-language questions and checks **20 federal programs** at once.
It then shows *why* you may qualify, an estimated dollar value, what documents to bring, and where to apply.

Built for EvoHacks II, themed "Projects for Social Good."

[Team roadmap and demo plan](docs/hackathon-plan.md)

## Run it

The screener and on-device practice form run as static files. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5317
```

Then visit http://localhost:5317. Click **"Try an example household"** for a one-click demo.

## Practice application autofill

Choose **Try an example household → Maria, single mom in Texas**. Open **Try application autofill** in her SNAP result, choose which fictional answers to use, and select **Practice on this device**. Change the rent and review the form. A field you uncheck stays blank. The real agency application is linked separately.

To exercise Microsoft's Playwright MCP driver locally with Node 22.12+ and Chromium, run:

```sh
npm ci
npx playwright install chromium
npm run autofill:demo
```

The driver connects to a test browser, fills the practice form, and hands the same page back for review. The demo uses zero language-model tokens and runs without a paid browser session or sign-in. To use an existing Chrome installation, set `CLAIMABLE_CHROME_PATH` to the executable. The GitHub **Application review** workflow runs the automated tests, static build, MCP demo, and mobile Chromium and WebKit checks on pull requests to `main`.

### Hosted review on Vercel

The same site serves `/apply/` to a desktop or iPhone browser. Vercel builds the public assets with `npm run build` and serves `/api/review` as a Node function. For hosted practice, set these **server environment variables** and redeploy:

| Variable | Value |
| --- | --- |
| `CLAIMABLE_PUBLIC_ORIGIN` | Public HTTPS origin of this deployment, e.g. `https://your-project.vercel.app`. Its `/practice/` page must be reachable by the hosted browser. |
| `MOJOAUTH_ISSUER`, `MOJOAUTH_CLIENT_ID` | The same OIDC issuer and public client ID configured in `js/config.js`. Register this origin's `/auth/callback` and logout URL in MojoAuth. |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | Credentials for a Browserbase project with keep-alive sessions enabled. Keep the API key in Vercel's server settings. |

**Start hosted practice** appears when both sign-in and the server configuration are available. The server checks the signed-in identity, creates a private browser and uses Playwright MCP to fill the selected sample fields. The applicant edits that same page, with a tap keypad for phones. Finishing practice or choosing **End hosted session** releases the browser. Abandoned sessions expire after ten minutes. Browserbase processes the sample answers shown there and charges for browser runtime. Recording and session logging are disabled. Keep edits fictional. [Browserbase live view](https://docs.browserbase.com/platform/browser/observability/session-live-view)

## Test it

```
npm ci
npm test
npx playwright install chromium webkit
npm run test:review
npm run test:review -- --webkit
```

The 12 rules tests check the eligibility math against hand-calculated cases (SNAP benefit formula, EITC phase-in and
phase-out, the refundable Child Tax Credit, Medicaid expansion vs. non-expansion states, SSI income counting, and more).
The 7 auth tests cover the OIDC settings (code flow, public client, redirect URIs), turning the signed-in user into a
local session, the app's base path on GitHub Pages, session expiry, per-user saved checklists, and blocked storage.

## Optional sign-in (MojoAuth, OpenID Connect)

People can sign in passwordlessly with [MojoAuth](https://mojoauth.com) to **save their checklist and reopen it later**,
for example after gathering documents. Signing in is never required to use the screener.

**How it works:** OpenID Connect authorization code flow with **PKCE (S256)** and `state`, as a **public client**
(no client secret; the token request sends only `client_id`, i.e. token endpoint auth method "none").
It uses the standard browser OIDC library [oidc-client-ts](https://github.com/authts/oidc-client-ts), which also
validates the ID token (signature, issuer, audience, nonce). Scopes: `openid profile email`.

1. The user clicks **Save my checklist** (or **Sign in**). Claimable explains what's shared, then redirects to MojoAuth's hosted login page.
2. The user enters their email and the one-time code.
3. MojoAuth redirects to `/auth/callback`, which exchanges the code using the PKCE verifier and saves the checklist if that's why they signed in.
4. The user lands back on their results, with their email shown in the header.

**Setup:** set `oidcIssuer` and `oidcClientId` in `js/config.js`. Both are public values. This is a static site
with no build step, so they live there instead of in environment variables. In the MojoAuth dashboard, allow these redirect URLs:
`http://localhost:5321/auth/callback` (any localhost port works in test mode) and `https://<user>.github.io/<repo>/auth/callback`.
Leave either value empty and sign-in is hidden.

**Privacy:** MojoAuth only sees the email used to sign in. Household answers are saved in that browser's local storage,
keyed by the user's OIDC `sub`, and never sent to a server. Users can delete their saved checklist with one click.
OIDC tokens are kept in `sessionStorage` for that tab. Hosted practice sends the ID token to Claimable's backend to verify who can create, reopen, or end the review session.

## How it works

```
index.html     3-step form + results page (semantic HTML, works on phones)
styles.css     light/dark themes, large-text mode, print styles for the checklist
js/data.js     every official number (2026 poverty guidelines, SNAP FY2027 tables, IRS 2026 limits), each with its source URL
js/rules.js    the rules engine: one small, testable function per program that returns a status, reasons, and a value
js/app.js      reads the form, calls Claimable.screen(), renders results, read-aloud, save/sign-in UI
js/auth.js     optional MojoAuth sign-in (OIDC + PKCE via oidc-client-ts) + per-user saved checklists
js/config.js   site settings (OIDC issuer + client ID, both public)
auth/callback/ OIDC redirect page: finishes sign-in, then returns to the app
apply/         choose fictional answers and open on-device or hosted practice
practice/      editable SNAP practice form and final review
api/review.mjs authenticated hosted session management on Vercel
scripts/       static build, Playwright MCP driver and browser checks
tests/         Node tests for screening, authentication, autofill and session ownership
```

**Design decisions**
- **Deterministic rules, no AI deciding eligibility.** Benefits decisions affect people's lives, so every result
  comes from plain code with a written reason the user can read ("Your income is 92% of the poverty line; the limit is 130%").
- **Private by design.** The screener processes household answers on-device. Hosted practice uses a separate fictional sample. Many families avoid
  benefits because they fear their data will be shared (for example, immigration concerns).
- **Categorical eligibility.** Getting SNAP or Medicaid automatically qualifies you for WIC, Lifeline, and free school meals.
  Most people don't know this, and Claimable surfaces it.
- **Accessible.** Phone-first layout, labeled form fields, keyboard navigation, a large-text toggle, read-aloud,
  a printable checklist, and plain language.

## Programs checked

SNAP, WIC, free/reduced school meals, SUN Bucks (Summer EBT), EITC, Child Tax Credit, Medicaid (adults),
Medicaid/CHIP (kids), ACA marketplace tax credits, hospital charity care, LIHEAP, Weatherization, Lifeline,
Head Start, child care assistance, Pell Grant, TANF, SSI, housing vouchers, and unclaimed property.

## Limitations (please read)

- These are **screening estimates**, not eligibility decisions. The agency that runs each program decides.
- Saved checklists live in one browser. The hosted review backend handles practice sessions only.
- It uses federal rules. Many states have higher limits, extra programs, or different rules (TANF, child care, and LIHEAP vary the most).
- Asset tests are not checked, except as a note for SSI.
- Dollar values for WIC, school meals, and LIHEAP are national-average estimates, and they're labeled as such.
- The EITC estimate treats all "other income" as taxable, which understates the credit for families with child support or other non-taxable income.
- Immigration-status rules are not modeled.
- Rules data is current as of November 2026 and needs a yearly update in `js/data.js`.

## What was built during the event

All code in this repository was written during EvoHacks II (Nov 21–22, 2026). No templates or pre-existing code.
AI assistance (Claude) was used to research program rules and draft parts of the code. The team reviewed, tested,
and can explain all of it. See the demo video.
Codex assisted with the practice form, Playwright MCP integration, and CI checks.

## Ideas for next steps

- Spanish and other languages
- State-specific rule packs (starting with the states that have the most unclaimed benefits)
- Photograph a benefits letter or bill so it can be read automatically, with the eligibility decision still made in code
- SMS version for people without smartphones
- "Save my checklist" as a PDF
