# Full Canadian and Mexican screening

## Current shipped behavior

This branch matches `main` for screening logic plus Canada/Mexico directory links on the intro view. There is no country dispatcher yet; the form and `Claimable.screen` pipeline are U.S.-only.

| Area | What runs today |
| --- | --- |
| `index.html` | Intro with U.S. **Start** and **Try an example** (`details.demo`); expandable **Canada & Mexico official guides** (`details.country-guides`, five agency links, no form data); multi-step U.S. intake; results with category chips, print and read-aloud. Scripts: `js/data.js`, `js/rules.js`, `js/app.js`. |
| `styles.css` | Layout, focus rings, large-text toggle, print styles, `country-guides` disclosure styling. |
| `js/app.js` | `init` wires demos and navigation; `readForm` / `fillForm` / `validate` for the U.S. form; `runScreen` calls `Claimable.screen(readForm())`; `render` and `card` group results by status; `toggleSpeech` for read-aloud. |
| `js/rules.js` | `Claimable.screen(household)` evaluates 20 federal programs, sorts by status, returns `ctx`, `results`, and `totals`. |
| `js/data.js` | `ClaimableData`: states, FPL tables, program constants, `asOf` date. |
| `tests/rules.test.js` | 12 Node tests; run with `node --test tests/rules.test.js`. |

**Status keys** in code and tests: `likely`, `maybe`, `enrolled`, `unlikely`. The UI labels the `maybe` group **Worth checking** (`#list-maybe`, chips, summary text).

**`readForm` coercion:** numeric fields use `parseFloat(...) || 0`, so a blank income field becomes **0**, not unknown. Checkboxes and empty child-age rows are handled separately; preserving “unknown vs zero” for future CA/MX income questions is a planned change.

**`Claimable.screen` return shape today:**

```js
{
  ctx: { size, pct, fplAnnual, grossAnnual },
  results: [{ id, name, category, kind, blurb, apply, source, docs, status, reasons, annual, valueLabel }, ...],
  totals: { likelyAnnual, maybeAnnual, likelyCount, maybeCount }
}
```

Each `results[].status` is one of the four keys above; `reasons` is a string array; dollar estimates use USD in `annual` / `valueLabel` where present.

## User experience

1. **Choose where you live.** Country and province/territory or state determine the programs. Offer all 13 Canadian provinces and territories and all 32 Mexican federal entities. Language is a separate preference. State the supported coverage near the start button.
2. **Household.** Collect adult and child ages, relationships and country-specific caregiving or residency facts. Use progressive questions so a household without children skips custody and schooling.
3. **Income and situation.** Ask for the income definition and period required by the selected programs. Canadians may need a prior tax year's adjusted family net income. Mexican programs may use age, residence, education or disability criteria without an income threshold. Include “I don't know” where uncertainty is meaningful.
4. **Results.** Use the existing likely, worth-checking, enrolled and unlikely groups. Explain each match with the supplied answers. A missing required fact produces a worth-checking result with a precise follow-up. Let users edit their answers.
5. **Take action.** Each program has documents, official application instructions, application availability, and a print-friendly checklist. Where registration is in person, link to the official module locator and current registration announcement. Show the original payment cadence, such as monthly CAD or every two months in MXN.

Users can reach their results, print them and follow agency links without an account. Saving a checklist can be offered after results. Country switching confirms discarding entered answers, clears results and speech playback, and starts the new intake. Language switching retains answers and rerenders all labels and reasons. Personal identifiers such as SIN, CURP, ID numbers and bank details belong on the application checklist. Screening asks only for facts needed to evaluate a program.

## Architecture mapped to this repository

| Current file or function | Planned change |
| --- | --- |
| index.html | Add country/language controls, country-specific field groups and accessible labels. Replace the directory shortcut with the full country entry points once implemented. |
| js/app.js init, readForm, fillForm, validate | Delegate intake and validation to the selected country's configuration. Preserve unknown versus zero. Scope enrollment IDs to country. Keep demos aligned with real intake fields. |
| js/app.js runScreen | Call an explicit country dispatcher. Reject an unknown country with a visible validation message. |
| js/app.js render, card, toggleSpeech | Render structured, translated reasons, country currency and application state. Set document and speech language. The existing ctx.pct and FPL summary belongs to the U.S. renderer. |
| js/data.js and js/rules.js | Keep the existing Claimable.screen(household) contract as the U.S. entry point, including current tests. Wrap it in the new dispatcher. |
| Proposed js/countries/ca-data.js, ca-rules.js and mx equivalents | Hold independently sourced country data and pure evaluation functions. Follow the existing browser plus CommonJS loading pattern. |
| Proposed js/countries.js and js/i18n.js | Explicit country dispatch and language dictionaries. Add script tags in dependency order before app.js. |
| styles.css | Reuse the current visual system, focus treatment, large-text mode and print styles. |

Use a request envelope with country, language, answers and an explicit asOf date. Keep country answers in their own shape. The same selected language can render different countries. Country modules return the same result contract while retaining local eligibility concepts.

## Proposed result contract

Each result includes a stable country-prefixed ID, authority, category, status, reason codes with interpolation values, required unanswered questions, source references, effective period, last verification date, application steps and document requirements. Application availability has separate open, closed, continuous or unknown states and a verification date. A closed intake can coexist with a likely eligibility result.

Represent a payment estimate with amount, currency, cadence, period start/end and estimation basis. Support null for an unknown amount and zero for a confirmed zero payment. Represent cash, tax reductions, insurance coverage and services distinctly. Reuse current annual totals only for known additive cash values in the same currency and period. Show individual values until overlap and exclusivity have been verified. Enrollment removes a benefit from additional support totals. Annualization requires known payment periods and is explained beside the total.

For each threshold or formula, store the official source and effective dates. Evaluation takes an explicit date for reproducible tests. Expired or future rules produce worth-checking results and identify the missing current rule. Avoid converting monthly wages into a Canadian tax measure without the adjustments required by CRA.

## Acceptance scenarios

### Already expected (live U.S. app + this PR)

- U.S. sample households keep their existing results and all 12 `node --test tests/rules.test.js` cases pass.
- Intro shows Canada/Mexico official-guide links that work with keyboard and with JavaScript disabled; U.S. intake does not collect CA/MX household answers yet.
- Status display uses the four keys above; `maybe` appears as “Worth checking” in the UI.
- Print checklist, large-text mode, read-aloud, and progressive form steps work for the U.S. flow.

### Future (full CA/MX screening)

- A Canadian household can enter province, family/custody facts and the requested tax-year information, see a CCB assessment and print an application checklist.
- A Canadian older adult sees the residence-history questions required for OAS and relevant income questions for GIS.
- A Mexican adult aged 65 can answer nationality and residence questions and get a pension assessment with official registration instructions.
- A Mexican woman within the published Mujeres Bienestar age range sees her program assessed independently of older-adult pension coverage.
- Boundary ages, threshold equality, payment-year changes and partial-year entitlement match hand-calculated official examples.
- Skipping a required status or income answer produces a precise follow-up. Blank income stays unknown, while entered zero stays zero.
- Country switching prevents prior enrollment, money, child answers and results from leaking into the next screening.
- All unsupported jurisdictions are handled explicitly. Federal-only coverage is named where provincial or state supplements are pending.
- Mobile at 320px, keyboard navigation, screen-reader labels, focus after errors, large text, print and localized read-aloud work for each language.
- Script-disabled users still receive useful official resources. Ordinary screening performs no transmission of household answers.
