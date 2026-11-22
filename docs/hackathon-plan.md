# Claimable team roadmap for EvoHacks

**Demo goal:** Give Maria, a fictional applicant, a clear answer to three questions. What does the agency need from her? What else can she bring if she lacks a document? When is it due?

Maria screens her household, resolves one uncertain result, and selects **I'm ready to apply**. Later she photographs a fictional agency letter on her iPhone, confirms the requested proof and deadline, and returns to her updated checklist. This roadmap describes proposed work. The [README](../README.md) covers the current app.

## Claim a workstream

Add your name in the owner column or comment on the roadmap PR with the workstream you want. Agree on the shared fields below before starting separate feature branches.

| Workstream | Owner | First usable deliverable |
| --- | --- | --- |
| Applicant experience | Open | On the mobile results screen, answer **What would change this result?** inline. Open a checklist from **I'm ready to apply**. Tap **I don't have that document** to see an agency-accepted alternative. |
| Document AI and iPhone experience | Open | Scan a fictional agency letter using the mobile website on a real iPhone. Highlight the source wording for the requested proof and deadline. Let the applicant correct both before adding them to the checklist. |
| Country rules and timelines | Open | Keep the U.S. screener working. Verify one Canadian and one Mexican program, each with country-specific questions, an official next step, and a sample household. Build a sourced timeline for the U.S. demo program. |
| MojoAuth and saving | Open | Let guests finish screening. Offer passwordless login at **Save progress**. Sync checklist progress across browsers and let users explicitly save original documents in an encrypted vault on the original device. |

## Prepare my application

The applicant experience owner builds the review screen. The country rules owner verifies the form version, field meanings, and filing instructions. Start with Maria's Texas SNAP example and the official Texas Works Application for Assistance (H1010).

1. From a SNAP result, Maria selects **Prepare my application**. On her device, map confirmed household answers into matching fields on the current official form. Ask for missing answers in the agency's units and time periods. Leave unknowns blank and let Maria go straight to the agency at any point.
2. Show each prepared answer with its source and an edit control. For example, Maria's household income estimate alone cannot answer how much a particular employer paid her on a particular date. Ask her for that detail. Keep signatures and attestations for her personal review and completion.
3. For the iPhone demo, use the [interactive review flow](#review-a-prepared-application-on-iphone) below. For Texas SNAP, offer the official portal alongside a copyable answer sheet or a printable, unsigned H1010 with filing instructions. A live Texas portal handoff still requires verification. [Texas application procedures](https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/a-120-office-procedures)
4. Demo with fictional data: edit an answer and verify the exported form changes, leave a question unanswered and verify the field stays blank, and check that exporting keeps the timeline at **Prepared**. Only record **Submitted** when Maria reports filing. Verify the form layout against the current agency version before release.

Fixed field mappings, validation, review, and PDF generation use zero language-model tokens. The on-device document reader can suggest values for Maria to confirm. Preparing the answer sheet or printable draft happens on-device. Interactive review sends only the fields Maria selects to the hosted browser and incurs browser runtime costs.

### Review a prepared application on iPhone

The iPhone opens `/apply` on the team's existing Vercel site. The hackathon demo uses a clearly labeled practice form with fictional data. A native iOS client can open the same route later. A team-owned custom domain can also point an `apply` subdomain to the project. [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain)

1. **Choose what to share.** The applicant experience owner shows Maria the destination and the answers she is about to send, such as household size, monthly rent, and utilities. She signs in with MojoAuth and confirms those fields. Document images, OCR text, and vault keys stay on the phone.
2. **Prepare the remote draft.** The MojoAuth and saving owner adds a server-side endpoint that verifies Maria's session and creates an isolated browser session for her. A managed browser host keeps it running while she reviews. Playwright MCP connects to that browser from the backend and fills the practice form using fixed field mappings checked by the country rules owner. Leave unmatched fields blank. Keep provider credentials and browser-control endpoints on the backend. [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
3. **Hand Maria the same browser.** Stop automation before review. The iPhone experience owner opens an interactive live view inside `/apply`. The backend checks session ownership before issuing short-lived viewer access. Maria sees the filled form, can change any answer, and personally controls the final action. Keep practice completion separate from the real benefits timeline. Disable provider recording and session logging, and end the session on completion, cancellation, or timeout. [Browserbase live view](https://www.browserbase.com/blog/what-is-a-browserbase-browser) · [Session settings](https://github.com/browserbase/sdk-node/blob/main/src/resources/sessions/sessions.ts)

**Acceptance test.** On a real iPhone, show the three fictional values already in the practice form, change the rent, and advance to review. Verify the corrected rent persists, an unanswered question stays blank, and automation stops before submission. A second account must be unable to open the first account's review. Expired sessions should offer a fresh start or the answer sheet and leave the application at **Prepared**. Label the demonstration as practice until the team verifies the live portal workflow.

## Where the features meet

- **Results and rules.** Distinguish an unknown answer from “No.” Start with the existing WIC rule that considers Medicaid enrollment. When the answer would affect a result, ask once, rerun the rule, and explain the change. Keep uncertainty visible when the applicant selects “I'm not sure.”
- **Documents and checklist.** The scanner gives the checklist a program ID, requested proof, due date, and the text supporting each suggestion. The user confirms or corrects suggestions. Match acceptable substitutes to the agency, program, and purpose. Where two programs accept the same proof, marking it ready updates both. Where the agency lists no substitute, link to its instructions.
- **Timeline.** Let the applicant record the actual submission date. Opening an agency link does not establish submission. Label dates by origin: user entry, published agency timeframe, or a date confirmed from an agency notice or account. Show how the benefit arrives, such as an EBT card, and where to check individual status. Where timing is unknown, show the official contact route. [USDA SNAP handbook](https://snapqcs.fns.usda.gov/Welcome/Doc/FNS310Handbook.pdf) · [CRA payment guidance](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4114/canada-child-benefit.html)
- **Login and privacy.** MojoAuth handles sign-in. Verify the login on the backend and enforce account ownership on each progress read or write. Sync program IDs, checklist completion, and confirmed milestone dates. Keep files, filenames, extracted text, and encryption keys on-device. Encrypt saved files with authenticated encryption and a separate vault passphrase. Lock on sign-out or reload, offer deletion, and explain device loss, cleared storage, and forgotten passphrases before saving. Update the privacy copy when sync ships. [MojoAuth hosted login](https://mojoauth.com/docs/hosted-login-page/)

## Country coverage and follow-on ideas

Let users choose country and language separately. Keep monthly assistance separate from annual tax credits, and show application effort when a source supports it. MyFriendBen's language-first onboarding and Denver Human Services' sample results informed these choices. [Colorado screener](https://screener.myfriendben.org/co/step-1) · [Denver Human Services example results](https://denvergov.org/files/assets/public/v/1/denver-human-services/documents/myfriendben/myfriendben_flyers_eng-sp-viet.pdf)

Start Canada with the Canada Child Benefit and Mexico with the older-adult pension. For each, verify requirements with the administering agency, record when the team checked the source, and use the local currency and terminology. Display the number of programs actually screened. Switching countries should clear incompatible answers. [Canada Child Benefit](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4114/canada-child-benefit.html) · [Mexico's benefits directory](https://www.programasparaelbienestar.gob.mx/)

After the core journey works, try these in order:

1. **I need help this week.** Show a verified local resource for the demo location while the applicant waits for a longer-term benefit.
2. **Tax document reader.** Support a fictional W-2 image and highlight the tax year and Box 1 wages for confirmation. Ask separately about current household income. [IRS W-2 instructions](https://www.irs.gov/instructions/iw2w3)
3. **Native iOS app.** Use feedback from the iPhone camera and checklist test to decide what would benefit from a native experience.

## Tests and demo

1. Hand a teammate outside the feature area an iPhone and a fictional letter. Ask them to identify the proof, an accepted alternative, and the deadline without coaching. Try a blurry photo and an ambiguous date. Both should allow manual entry.
2. Sign in on a second browser and verify that the checklist returns. Confirm the original stays in the first device's vault, that a different account cannot retrieve the checklist, and that OCR sends no document content over the network. Test locking, unlocking, and deleting a saved sample.
3. Run the existing suite with `node --test tests/rules.test.js`. Add cases for unknown answers, accepted alternatives, country switching, and unavailable timing. Check an eligible, ineligible, and incomplete example for each new country program.
4. Record a 2–3 minute demo following Maria from uncertain result to confirmed next action. Give a teammate time to explain how OCR suggests information and how the rules engine evaluates eligibility. Integrate this journey before expanding the document formats or program catalog.
