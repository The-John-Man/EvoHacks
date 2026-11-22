# Claimable

**Find the benefits your household is leaving on the table.**

Billions of dollars in food aid, tax credits, health coverage, and utility help go unclaimed every year:
about 1 in 5 people eligible for the EITC never claim it, 44% of people eligible for WIC aren't enrolled, and LIHEAP reaches only
about 1 in 6 eligible households. Claimable asks a few plain-language questions and checks **20 federal programs** at once.
It then shows *why* you may qualify, an estimated dollar value, what documents to bring, and where to apply.

Built for EvoHacks II, themed "Projects for Social Good."

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5317
```

Then visit http://localhost:5317. Click **"Try an example household"** for a one-click demo.

## Test it

```
node --test tests/rules.test.js tests/auth.test.js
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
OIDC tokens are kept in `sessionStorage` for that tab only, and are used only to sign out of MojoAuth too.

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
tests/         Node built-in test runner, no packages needed
```

**Design decisions**
- **Deterministic rules, no AI deciding eligibility.** Benefits decisions affect people's lives, so every result
  comes from plain code with a written reason the user can read ("Your income is 92% of the poverty line; the limit is 130%").
- **Private by design.** Household answers are never sent anywhere, with no backend, required accounts, or analytics. Many families avoid
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
- Saved checklists live in one browser. They don't sync across devices, because that would need a backend that
  verifies the access token server-side and stores data. Today the ID token is checked only in the browser, which is
  acceptable because saved data never leaves the device.
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

## Ideas for next steps

- Spanish and other languages
- State-specific rule packs (starting with the states that have the most unclaimed benefits)
- Photograph a benefits letter or bill so it can be read automatically, with the eligibility decision still made in code
- SMS version for people without smartphones
- "Save my checklist" as a PDF
