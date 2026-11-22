# Claimable

**Find the benefits your household is leaving on the table — in the United States, Canada, or Mexico.**

Claimable asks a few plain-language questions and checks federal programs for the country you choose. It then shows *why* you may qualify, an estimated value where rules allow, what documents to bring, and where to apply. UI languages: **English**, **Français**, and **Español**.

Built for EvoHacks II, themed "Projects for Social Good."

[Team roadmap and demo plan](docs/hackathon-plan.md)

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5317
```

Then visit http://localhost:5317. Choose a country and language, or open **Try an example household**.

## Test it

```
node --test tests/rules.test.js tests/countries.test.js tests/auth.test.js tests/timing.test.js
```

U.S. tests cover SNAP/EITC/CTC/Medicaid/SSI math. Country tests cover the dispatcher (CA/MX never hit U.S. rules), CCB estimates, OAS age/residence boundaries, and Mexico pension / Mujeres Bienestar windows. Auth tests cover OIDC settings, sessions, GitHub Pages base path, and saved checklists. Timing tests use fixed dates and cover processing-time rules, step statuses (late/overdue/done), updates, the undated fallback, Medicaid's 2027 changes, tax refund dates, and tracking storage.

## Application timelines

Every match has its own **timeline** (modeled on the ReUI horizontal `<Timeline>` pattern, rebuilt in plain HTML/CSS):
enter the date you applied, and it shows each step with dates, whose turn it is, and when the help should arrive.

- **Your steps** (interviews, documents, picking a plan, paying the first premium, work reporting), **office steps**,
  **when help arrives**, and **renewals**, each marked *Now*, *Upcoming*, *Overdue*, *Running late*, or *Done*.
- Select a numbered milestone to mark that step complete.
- Timelines are open by default and **assume you apply today**, labeled *Estimated*. Change the date if you already
  applied. Tax credits instead follow the tax-season calendar, since you claim them by filing a return.
- U.S. timings come from federal rules, the calendar (PATH Act refunds, open enrollment, summer), or published averages.
  Each timeline says which, with a source link. Includes H.R. 1's 2027 Medicaid changes: 6-month renewals and work
  reporting for expansion adults (with exemptions), and shorter backdated coverage.
- **Canada and Mexico** programs get the same tracker without dates for later steps, because we haven't researched
  their processing times yet. We don't invent dates.
- Signed-in users' timelines are saved on their device under their account; otherwise they last while the page is open.
- Logic: `js/timing.js` (`PLANS`, `ESTIMATORS`, `buildTimeline`). UI: `timelineBlock()` in `js/app.js`.

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
OIDC tokens are kept in `sessionStorage` for that tab only, and are used only to sign out of MojoAuth too.

## How it works

```
index.html              Country + language chooser, 3-step form, results, optional sign-in
styles.css              Themes, large-text mode, print checklist
js/data.js + rules.js   U.S. engine (Claimable.screen) — unchanged public API
js/countries/ca-*.js    Canada data + evaluators (CCB, OAS, GIS, CDB, CDCP)
js/countries/mx-*.js    Mexico data + evaluators (pensiones, becas, JCF)
js/countries.js         Dispatcher by country
js/i18n.js              EN / FR / ES UI strings
js/auth.js              Optional MojoAuth sign-in (OIDC + PKCE) + per-user saved checklists and timelines
js/timing.js            Per-program application timelines: step plans, processing times, sources
js/config.js            Site settings (OIDC issuer + client ID, both public)
js/app.js               Form I/O, demos, render, read-aloud, save/sign-in UI
auth/callback/          OIDC redirect page
tests/                  Node built-in test runner
```

**Design decisions**
- **Deterministic rules, no AI deciding eligibility.** Every result comes from plain code with a written reason.
- **Private by design.** Household answers are never sent to a backend. Optional sign-in only stores a checklist in this browser.
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
- No live agency APIs, auto-apply, or scraped registration calendars — availability is a maintained label (`open` / `continuous` / `unknown`).
- Saved checklists live in one browser. They don't sync across devices.
- Timeline dates are estimates from federal rules and national averages; your state or agency may be faster or slower.
  U.S. step text is in English only for now (the timeline controls are translated).
- U.S. path still uses federal rules; many states have higher limits or extra programs. Call **211** for local help.
- Immigration-status modeling is limited to the questions each country’s published rules require.
- Rules data needs periodic updates (`js/data.js`, `js/countries/*-data.js`).

## What was built during the event

Code in this repository was written during EvoHacks II (Nov 21–22, 2026). AI assistance was used to research program rules and draft parts of the code. The team reviewed and tested it. See the demo video.

## Docs

- [North America overview](docs/north-america.md)
- [Screening specification](docs/north-america-screening.md)
- [Country program research backlog](docs/country-programs.md)
- [Cursor handoff](docs/cursor-handoff.md)
