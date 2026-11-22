# Claimable

Claimable checks a household against 20 U.S., five Canadian, or six Mexican federal programs. Each match includes the reason, an estimate when available, documents to gather, and an official application link. The administering agency makes the eligibility decision.

## Run locally

Open `index.html` in a browser, or start a local HTTP server from the project directory.

```sh
python -m http.server 5317 --bind 127.0.0.1
```

Open [Claimable on localhost](http://localhost:5317/). Choose **View full example** to explore a sample household or **Check my benefits** to start a questionnaire. The interface supports English, French, and Spanish. Some program descriptions and U.S. timeline steps use their source language.

## Test

Run the screening, timeline, and account-storage tests from the project directory.

```sh
node --test
```

## Optional sign-in

Screening runs in the browser. Signing in with MojoAuth lets someone save a checklist and application progress in that browser, under their account.

Set the public `oidcIssuer` and `oidcClientId` in `js/config.js`. Register the site's `auth/callback` path as the redirect URL and its base URL as the logout URL. For the local server these are `http://localhost:5317/auth/callback` and `http://localhost:5317/`. Leaving either configuration value empty hides sign-in.

## Maintaining the rules

U.S. thresholds and estimates live in `js/data.js`, with eligibility checks in `js/rules.js`. Canadian and Mexican data and rules live in `js/countries/`. Program records carry agency source links. Update the applicable figures, data date, and boundary tests together.

The U.S. data uses the 2026 HHS poverty guidelines and FY 2027 SNAP tables. Alaska and Hawaii poverty figures and the small-household SNAP minimum are approximations. The EITC calculation uses IRS Revenue Procedure 2025-32 and the rates in 26 U.S.C. § 32, with an approximate joint-filing adjustment. [HHS poverty guidelines](https://www.federalregister.gov/documents/2026/01/15/2026-00755/annual-update-of-the-hhs-poverty-guidelines) · [USDA SNAP adjustments](https://www.fns.usda.gov/snap/allotment/cola)

Application timelines live in `js/timing.js`. U.S. programs use published deadlines, calendars, or processing estimates. Canadian and Mexican timelines track the applicant’s own dates and completed steps.

## Credits

Built for EvoHacks II with AI assistance on program research and parts of the code. Sign-in uses oidc-client-ts, and the bundled Instrument Sans font is distributed under the SIL Open Font License. [oidc-client-ts](https://github.com/authts/oidc-client-ts) · [Font license](assets/fonts/OFL.txt)
