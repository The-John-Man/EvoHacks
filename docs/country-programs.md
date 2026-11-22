# Country program research backlog

## How this maps onto Claimable today

| Piece | Today | Planned CA/MX use |
| --- | --- | --- |
| `js/data.js` | U.S. FPL, state list, dollar estimates, `ClaimableData.asOf` | Country-specific constants in proposed `js/countries/*-data.js` modules |
| `js/rules.js` | `Claimable.screen(household)` — pure U.S. program list and evaluators | Wrapped by a country dispatcher; U.S. path keeps this entry point for regression tests |
| `js/app.js` | Single U.S. form → `readForm()` → `runScreen()` | Country-specific fields and validation before calling the dispatcher |
| `index.html` | U.S. intake + `details.country-guides` referral links (five URLs) | Country/language controls and localized labels; guides remain for script-disabled users |
| Tests | `tests/rules.test.js` asserts U.S. rules only | Add tests that CA/MX and invalid countries never invoke U.S. evaluators |

Encoding a row in the tables below means adding sourced predicates to the appropriate country module, not extending `rules.js` until the dispatcher exists.

## Evidence status

The earlier research inspected the Canadian Benefits Finder, CRA CCB eligibility page, Mexico's program directory and its older-adult pension detail page on November 21, 2026. The other programs below are implementation research leads. Retrieve their current official eligibility, calculation and application pages before encoding rules. This document intentionally leaves monetary constants unresolved because payment years and program rules change.

For every program, capture the administering authority, exact source URL and section, effective period, jurisdiction, eligibility predicates, exceptions, income definition, formula, frequency, documents, application route and current registration availability. Keep quotes or a concise extraction beside each rule in the development notes. Record contradictions between a summary and detailed operating rules and resolve them using the governing current publication.

## Canada

| Priority | Program | Inputs and research to complete |
| --- | --- | --- |
| First pilot | Canada child benefit | Confirm caregiver and tax-residency requirements, eligible applicant/spouse statuses, temporary-resident timing, shared custody, child special allowances, adjusted family net income and tax-year mapping. Implement child age bands, reductions and partial-year rules from the current calculation page. |
| First release | Old Age Security | Research age, legal status, years of Canadian residence after age 18, minimum residence and international agreement exceptions. Ask residence duration only when needed. Handle partial pensions and deferred start before estimating a payment. |
| First release | Guaranteed Income Supplement | Research OAS receipt, residence, marital/partner status, partner pension categories, income exclusions and annual income periods. Evaluate couples and individual payments using the published tables. |
| Next | Canada Disability Benefit | Verify age, Disability Tax Credit approval, tax filing, residence/status, adjusted family income and employment exemptions. Handle DTC approval pending as missing eligibility evidence. |
| Next | Canadian Dental Care Plan | Verify coverage access, income and tax-return conditions, residency and copayment rules. Show a coverage assessment and application steps. |
| Regional expansion | Provincial and territorial support | Inventory each jurisdiction's child supplements, income assistance, disability, rent and energy support. Start with a named province and show supported local programs explicitly. |

The CCB requires living with a child under 18, primary caregiving, tax residence and an eligible status for the applicant or spouse/partner. CRA's shared-custody guidance uses the 40–60% range. These facts were inspected in the prior research. Application eligibility and payment calculation need separate implementation. [CRA eligibility](https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-before-you-apply.html) · [CCB overview and calculation navigation](https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview.html)

Use these official starting points to resolve the remaining Canadian program questions. Follow the agency's current navigation if a deep link has moved. [Benefits Finder](https://www.canada.ca/en/services/benefits/finder.html) · [Public pensions](https://www.canada.ca/en/services/benefits/publicpensions.html) · [Disability benefits](https://www.canada.ca/en/services/benefits/disability.html) · [Dental care](https://www.canada.ca/en/services/benefits/dental.html)

## Mexico

| Priority | Program | Inputs and research to complete |
| --- | --- | --- |
| First pilot | Pensión para el Bienestar de las Personas Adultas Mayores | Age, nationality by birth/naturalization and residence. Verify the effective payment amount, registration windows and official module locator. |
| First release | Pensión Mujeres Bienestar | Directory describes women aged 60–64 and Mexican nationality. Verify residence, age transitions into the older-adult program, documents and current operating rules. |
| Next | Pensión para Personas con Discapacidad | Research permanent-disability certification, age bands, state agreements and locality exceptions. Build coverage by state from current governing rules. |
| Next | Beca Rita Cetina | Verify eligible grades, public school enrollment, student/household unit, conflicting scholarships, payment calendar and registration route. |
| Next | Beca Benito Juárez | Verify upper-secondary public enrollment, age or duration rules, incompatible scholarships and payment schedule. |
| Next | Jóvenes Construyendo el Futuro | Directory describes ages 18–29 and neither working nor studying. Verify participation history, training commitments, available openings and benefit duration. |
| Regional expansion | State and municipal support | Catalog local disability, school, food and housing programs using state/local authority sources. Surface jurisdiction and application availability on every card. |

The inspected older-adult page lists age 65+, Mexican nationality, Mexican residence, birth certificate, current ID, recent CURP, proof of address and contact number. It describes in-person registration during announced periods and payment every two months. Show a document checklist without asking users to enter document numbers. [Pension detail](https://www.programasparaelbienestar.gob.mx/programas/adultos-mayores/pension-para-personas-adultas-mayores/)

Use the official directory to find each current program page and the Diario Oficial de la Federación to validate operating rules and effective dates. The directory summaries alone leave the exceptions in the backlog unresolved. [Program directory](https://www.programasparaelbienestar.gob.mx/) · [Official Gazette](https://www.dof.gob.mx/)

## Example households for implementation

Create fictional demos with explicit screening dates and source-backed expected results. Include a Canadian single parent, a shared-custody family, a low-income senior, a Mexican adult turning 65, a woman turning 60 and a student household. Calculate expected values independently from official examples. Include a household with missing information so the demo demonstrates follow-up questions and useful application guidance.
