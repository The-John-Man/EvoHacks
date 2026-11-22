# Claimable

**Find the benefits your household is leaving on the table — in the United States, Canada, or Mexico.**

Claimable asks a few plain-language questions and checks federal programs for the country you choose. It then shows *why* you may qualify, an estimated value where rules allow, what documents to bring, and where to apply. UI languages: **English**, **Français**, and **Español**.

Built for EvoHacks II, themed "Projects for Social Good."

[Team roadmap and demo plan](docs/hackathon-plan.md)

## Run it

The screener and on-device practice form run as static files. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5317
```

Then visit http://localhost:5317. Choose a country and language, or open **Try an example household**.

## Practice application autofill

Choose **United States** and **English**, then **Try an example household → Maria, single mom in Texas**. Open **Try application autofill** in her SNAP result, choose which fictional answers to use, and select **Practice on this device**. Change the rent and review the form. A field you uncheck stays blank. The real agency application is linked separately.

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

U.S. tests cover SNAP/EITC/CTC/Medicaid/SSI math. Country tests cover the dispatcher (CA/MX never hit U.S. rules), CCB estimates, OAS age/residence boundaries, and Mexico pension / Mujeres Bienestar windows. Auth tests cover OIDC settings, sessions, GitHub Pages base path, and saved checklists.

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
index.html              Country + language chooser, 3-step form, results, optional sign-in
styles.css              Themes, large-text mode, print checklist
js/data.js + rules.js   U.S. engine (Claimable.screen) — unchanged public API
js/countries/ca-*.js    Canada data + evaluators (CCB, OAS, GIS, CDB, CDCP)
js/countries/mx-*.js    Mexico data + evaluators (pensiones, becas, JCF)
js/countries.js         Dispatcher by country
js/i18n.js              EN / FR / ES UI strings
js/auth.js              Optional MojoAuth sign-in (OIDC + PKCE) + per-user saved checklists
js/config.js            Site settings (OIDC issuer + client ID, both public)
js/app.js               Form I/O, demos, render, read-aloud, save/sign-in UI
auth/callback/          OIDC redirect page
apply/ + practice/      Sample field selection, editable form and review
api/review.mjs          Authenticated hosted session management on Vercel
scripts/                Static build, Playwright MCP driver and browser checks
tests/                  Screening, sign-in, autofill and session ownership tests
```

**Design decisions**
- **Deterministic rules, no AI deciding eligibility.** Every result comes from plain code with a written reason.
- **Private by design.** The screener processes household answers in this browser. Hosted practice uses a separate fictional sample.
- **Country-native catalogs.** Canada and Mexico use their own federal programs, not copies of SNAP/Medicaid IDs.
- **Accessible.** Phone-first layout, keyboard navigation, large-text toggle, localized read-aloud, printable checklist.

## Programs checked

| Country | Count | Programs |
| --- | ---: | --- |
| United States | 20 | SNAP, WIC, school meals, SUN Bucks, EITC, CTC, Medicaid (adults/kids), marketplace, charity care, LIHEAP, Weatherization, Lifeline, Head Start, child care, Pell, TANF, SSI, housing, unclaimed property |
| Canada | 5 | Canada Child Benefit, Old Age Security, Guaranteed Income Supplement, Canada Disability Benefit, Canadian Dental Care Plan |
| Mexico | 6 | Pensión Adultos Mayores, Pensión Mujeres Bienestar, Pensión por discapacidad, Beca Rita Cetina, Beca Benito Juárez, Jóvenes Construyendo el Futuro |

## Limitations (please read)

- These are **screening estimates**, not eligibility decisions. Only the agency decides.
- **Federal programs only** for Canada and Mexico in this release. Provincial/territorial and estado/municipal supplements are **not** fully screened — use the official Benefits Finder / Bienestar directory (linked on the homepage).
- We do **not** collect SIN, CURP, bank, or ID numbers. Those belong on the agency checklist.
- Exact payment is not guaranteed. Where formulas are incomplete or household-specific, we show eligibility plus “agency calculates.”
- Application autofill is available on the fictional Texas SNAP practice form. Agency availability is a maintained label (`open` / `continuous` / `unknown`).
- Saved checklists live in one browser. They don't sync across devices.
- U.S. path still uses federal rules; many states have higher limits or extra programs. Call **211** for local help.
- Immigration-status modeling is limited to the questions each country’s published rules require.
- Rules data needs periodic updates (`js/data.js`, `js/countries/*-data.js`).

## What was built during the event

Code in this repository was written during EvoHacks II (Nov 21–22, 2026). AI assistance was used to research program rules and draft parts of the code. The team reviewed and tested it. Codex assisted with the practice form, Playwright MCP integration, and CI checks. See the demo video.

## Docs

- [North America overview](docs/north-america.md)
- [Screening specification](docs/north-america-screening.md)
- [Country program research backlog](docs/country-programs.md)
- [Cursor handoff](docs/cursor-handoff.md)
