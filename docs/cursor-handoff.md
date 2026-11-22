# Cursor implementation handoff

## Goal

Give households in Canada and Mexico the complete Claimable experience. They select their country, answer relevant household questions, receive explained program matches and estimates where supported, then print a checklist and follow official application instructions.

Implement country parity in the workflow. Each country's program coverage grows from a working release into a broader catalog. Citizenship alone does not establish eligibility. Ask residence and program-specific status questions where the published rules require them.

## Starting point

Use branch `north-america-implementation` and PR #1, titled `north america implementation`. The current app screens 20 U.S. programs and offers Canada/Mexico directory links. The standalone HTML preview is a generated snapshot. Edit the repository source.

Read these files first:

- [Product and engineering specification](north-america-screening.md)
- [Country research backlog](country-programs.md)
- [Earlier research and prize notes](north-america.md)

Run `python3 -m http.server 5317` from the repository and open localhost on the same computer. Run existing tests with `node --test tests/`.

## Ordered implementation tasks

- [ ] Introduce a country choice before household intake, initially supporting US, CA and MX. Add language selection for English, French and Spanish, independent of residence.
- [ ] Add an explicit country dispatcher and wrap the existing U.S. engine. Add a regression test that CA/MX and invalid country values never reach U.S. rules.
- [ ] Implement the Canadian child benefit flow end to end using current CRA rules, then the Mexican older-adult pension using current operating rules. Deliver a complete question-to-checklist path for each.
- [ ] Add country-aware results, currency, payment cadence, enrollment state and source dates. Handle missing answers and application availability.
- [ ] Add Canadian seniors and disability coverage and Mexican women, disability and education coverage using the research backlog. Each implemented program needs independently derived examples.
- [ ] Localize every visible question, error, result reason, printed label and read-aloud string. Review native-language terminology against official sources.
- [ ] Complete the acceptance scenarios in the specification, then update README coverage and PR description to describe the implemented behavior.

## Definition of the first usable release

Each country supports the same complete user journey. Canada includes at least CCB plus OAS/GIS screening. Mexico includes older-adult pension plus Mujeres Bienestar screening. Every implemented program supplies reasons, relevant missing information, an official source, the application route and a printable document checklist. Benefits with unverified formulas may show a match and an explanation that the amount requires an agency calculation. The UI identifies the programs actually checked.

Prioritize a complete first-country pilot before expanding the catalog. Read the agency rules during implementation, record the effective period and translate actual program concepts. The source dossier below records research leads as well as verified facts. Resolve the listed research gaps before encoding an eligibility decision.

## Suggested Cursor instruction

Implement the plan in docs/cursor-handoff.md, docs/north-america-screening.md and docs/country-programs.md on north-america-implementation. Begin by inspecting the existing app and tests. Build the country dispatcher and two complete pilot flows, then extend to the first usable release. Read current official sources and record effective periods before coding thresholds. Use the existing vanilla JavaScript architecture and preserve the public U.S. engine API and regression cases. Keep the PR updated with implemented coverage, source evidence and remaining work. Review the specification's acceptance scenarios before calling a release complete.
