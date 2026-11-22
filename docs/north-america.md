# North American benefits coverage

The next phase provides full screening flows for Canada and Mexico. Start with the [Cursor handoff](cursor-handoff.md), [screening specification](north-america-screening.md) and [country program backlog](country-programs.md).

## What is live on this branch

Merged with `main`: the full **U.S.** screener (`Claimable.screen`, 20 federal programs). **Try an example** loads four U.S.-only demo households (`DEMOS` in `js/app.js`); they are not Canada or Mexico scenarios.

This PR adds an expandable **Canada & Mexico official guides** block on the intro page (`details.country-guides` in `index.html`). It works with a keyboard and with JavaScript disabled and sends users to agency pages without posting form values.

The U.S. form still asks about state, monthly USD income, insurance and federal enrollment. A parent looking for Canadian child benefits should use the official links before answering those questions. Full CA/MX intake and rules are not implemented yet.

## First two screening pilots

| Pilot | Information the agency uses | Work before releasing a personalized result |
| --- | --- | --- |
| Canada child benefit (CRA) | Child under 18 living with the applicant, primary caregiver, Canadian tax residence, and qualifying status of the applicant or spouse/partner. Shared custody and child special allowances affect the determination. The payment is monthly in CAD. | Model shared custody and exceptions, confirm the benefit year and adjusted family net income needed for an estimate. Test ages 17/18, shared custody at 40%/60%, and a skipped status question. Provide English and French wording. |
| Pensión para el Bienestar de las Personas Adultas Mayores (Mexico) | Age 65 or older, Mexican nationality by birth or naturalization, and residence in Mexico. The program pays every two months in MXN. Registration is in person during announced windows. | Check current operating rules and registration dates. Show the agency checklist for birth certificate, current ID, CURP, proof of address and contact number. Ask only screening questions. Test ages 64/65, residence abroad and an unanswered nationality question. |

The Canadian Benefits Finder covers federal benefits and points to provincial and territorial services. Start with CRA eligibility and application guidance, then use the Finder for referrals. [Benefits Finder](https://www.canada.ca/en/services/benefits/finder.html) · [CCB overview and applications](https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview.html) · [CRA eligibility and custody](https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-before-you-apply.html)

Mexico’s program directory summarizes requirements. The individual pension page also specifies nationality, documents, payment frequency and how to locate a registration module. Recheck the detailed page when publishing a rule or amount. [Program directory](https://www.programasparaelbienestar.gob.mx/) · [Pension requirements and registration](https://www.programasparaelbienestar.gob.mx/programas/adultos-mayores/pension-para-personas-adultas-mayores/)

## Implementation sequence

1. **Directory (done on this PR).** Keep the U.S. intake and demo one click away. Offer official resources for Canada and Mexico before asking for household details.
2. **One program per pilot.** Add country-specific intake and rule modules when a pilot is ready. Route explicitly by jurisdiction before collecting answers. Keep answers scoped to that jurisdiction and clear them on a country change. Each program record needs an authority, source URL, effective period, last review date, required inputs, application route, currency and payment frequency. Unknown or unsupported answers should produce a referral. Exercise the published boundary cases and review native-language copy before enabling results.
3. **Extend jurisdiction by jurisdiction.** Inventory Northern America, Central America and the Caribbean, including territories with distinct administering agencies. Record the local authority, languages, subnational variation, program sources and review status before listing a jurisdiction. Starting points include Belize’s retirement benefit, Barbados’s social insurance programs and Greenland’s citizen portal. Each needs a program-level review before screening. [UN geographic groupings](https://unstats.un.org/unsd/methodology/m49/) · [Belize Social Security Board](https://socialsecurity.org.bz/long-term-retirement-benefit/) · [Barbados NIS](https://www.nis.gov.bb/) · [Greenland citizen services](https://sullissivik.gl/)

## Prize opportunities and usability

| Opportunity | Integration point and demo | Published award condition |
| --- | --- | --- |
| Best Use of Agentboxd | Give maintainers an Agentboxd inbox for official agency bulletins. Demonstrate a bulletin arriving, a matching program being flagged for review, and a maintainer checking the agency source before changing a rule. Use public program information only. Households see the reviewed source and date. | Meaningful Agentboxd use. Every team member must be 16+. This workflow is proposed. |
| MojoAuth Winning Project Awards | The existing feature/mojoauth-login branch adds optional passwordless checklist saving. Evaluate it after the results screen and demonstrate that reading, printing and leaving work without signing in. | Devpost lists five project awards. The listing gives no integration-specific qualification test. |
| Game & Visual Design Awards | A printable, localized checklist could show documents, next steps and the agency address in reading order. Test large text, grayscale print and a narrow screen, and show an example in the demo. | Awards are for selected game or visual-design projects. Selection is at the judges’ discretion. |

The event also lists SSOJet winning-team licenses. Organization sign-in would serve a future partner caseworker workspace, but the current household flow has no need for it. Geographic expansion supports the impact and accessibility judging criteria. Devpost lists no geography-specific prize. For the three-minute demo, show the U.S. example and a Canadian or Mexican referral, identify live versus planned features, explain the team's code, and credit agency data and AI assistance. [Event prizes and judging](https://evohacks2.devpost.com/) · [Submission and AI rules](https://evohacks2.devpost.com/rules) · [Agentboxd inbox capabilities](https://agentboxd.com/)

Research and the directory skeleton were prepared with Codex assistance during the event. Source pages checked November 21, 2026.
