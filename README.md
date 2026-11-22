# Claimable

**Find the benefits your household is leaving on the table — in the United States, Canada, or Mexico.**

Claimable asks a few plain-language questions and checks federal programs for the country you choose. It then shows *why* you may qualify, an estimated value where rules allow, what documents to bring, and where to apply. UI languages: **English**, **Français**, and **Español**.

Built for EvoHacks II, themed "Projects for Social Good."

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5317
```

Then visit http://localhost:5317. Choose a country and language, or open **Try an example household**.

## Test it

```
node --test tests/rules.test.js tests/countries.test.js
```

U.S. tests cover SNAP/EITC/CTC/Medicaid/SSI math. Country tests cover the dispatcher (CA/MX never hit U.S. rules), CCB estimates, OAS age/residence boundaries, and Mexico pension / Mujeres Bienestar windows.

## How it works

```
index.html              Country + language chooser, 3-step form, results
styles.css              Themes, large-text mode, print checklist
js/data.js + rules.js   U.S. engine (Claimable.screen) — unchanged public API
js/countries/ca-*.js    Canada data + evaluators (CCB, OAS, GIS, CDB, CDCP)
js/countries/mx-*.js    Mexico data + evaluators (pensiones, becas, JCF)
js/countries.js         Dispatcher by country
js/i18n.js              EN / FR / ES UI strings
js/app.js               Form I/O, demos, render, read-aloud
tests/                  Node built-in test runner
```

**Design decisions**
- **Deterministic rules, no AI deciding eligibility.** Every result comes from plain code with a written reason.
- **Private by design.** Nothing is sent anywhere — no backend, accounts, or analytics.
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
