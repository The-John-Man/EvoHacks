# Cursor implementation handoff

## Goal

Give households in Canada and Mexico the complete Claimable experience. They select their country, answer relevant household questions, receive explained program matches and estimates where supported, then print a checklist and follow official application instructions.

Implement country parity in the workflow. Each country's program coverage grows from a working release into a broader catalog. Citizenship alone does not establish eligibility. Ask residence and program-specific status questions where the published rules require them.

## Starting point

Use branch `north-america-implementation` and PR #1, titled `north america implementation`. Edit the repository source files directly (`index.html`, `styles.css`, `js/*`, `tests/*`, `docs/*`). There is no separate generated HTML preview artifact.

### What this branch already ships (merged with main)

- Static Claimable app from `main`: 20 U.S. federal programs via `Claimable.screen(household)`, four example households, printable checklist, large-text mode, read-aloud.
- Homepage Canada/Mexico official-guide directory (`details.country-guides` in `index.html`) with five external links; works with keyboard and with JavaScript disabled.
- Planning docs in `docs/` for the full CA/MX screening build-out.

### Read these files first

- [Product and engineering specification](north-america-screening.md)
- [Country research backlog](country-programs.md)
- [Earlier research and prize notes](north-america.md)

### Run and test

```
python3 -m http.server 5317
```

Open `http://localhost:5317`. Run existing tests with `node --test tests/rules.test.js` (12 cases). No npm install; no build step. Script load order in `index.html`: `js/data.js` → `js/rules.js` → `js/app.js`.

## Ordered implementation tasks

### Done on this PR

- [x] Directory skeleton: U.S. intake and demos stay one click away; Canada/Mexico get official referral links before any household questions.
- [x] Branch kept current with `origin/main` (Claimable engine unchanged; guides + docs layered on top).

### Implemented (North America screening)

- [x] Introduce a country choice before household intake, supporting US, CA and MX. Language selection for English, French and Spanish, independent of residence.
- [x] Explicit country dispatcher wrapping the U.S. engine (`Claimable.screen`). Regression tests that CA/MX and invalid country values never reach U.S. rules.
- [x] Canadian federal catalog: CCB (CRA calculation sheet 2025–26), OAS, GIS, CDB, CDCP — question-to-checklist path with demos.
- [x] Mexican federal catalog: Pensión Adultos Mayores, Mujeres Bienestar, discapacidad, Rita Cetina, Benito Juárez, JCF — with demos.
- [x] Country-aware results, CAD/MXN currency, payment cadence, enrollment flags, application availability labels, missing-answer follow-ups.
- [x] UI localization EN/FR/ES (`js/i18n.js`); speech `lang` follows selector. Program reason text remains in the language of the country module (EN for CA evaluators, ES for MX).
- [x] README coverage counts and explicit non-feasibles (no provincial catalogs, no SIN/CURP capture, no live APIs).

## Definition of the first usable release

Each country supports the same complete user journey. Canada includes at least CCB plus OAS/GIS screening. Mexico includes older-adult pension plus Mujeres Bienestar screening. Every implemented program supplies reasons, relevant missing information, an official source, the application route and a printable document checklist. Benefits with unverified formulas may show a match and an explanation that the amount requires an agency calculation. The UI identifies the programs actually checked.

Prioritize a complete first-country pilot before expanding the catalog. Read the agency rules during implementation, record the effective period and translate actual program concepts. Resolve research gaps in [country-programs.md](country-programs.md) before encoding an eligibility decision.

## Suggested Cursor instruction

Implement the remaining unchecked tasks in docs/cursor-handoff.md, docs/north-america-screening.md and docs/country-programs.md on north-america-implementation. Begin by inspecting the existing app and tests. Build the country dispatcher and two complete pilot flows, then extend to the first usable release. Read current official sources and record effective periods before coding thresholds. Use the existing vanilla JavaScript architecture and preserve the public U.S. engine API (`Claimable.screen`, `ClaimableData`) and the 12 regression cases. Keep the PR updated with implemented coverage, source evidence and remaining work. Review the specification's future acceptance scenarios before calling a release complete.