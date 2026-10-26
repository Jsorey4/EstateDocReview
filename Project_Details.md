# Estate Document Review: Project Details

**The estate document-review and analysis tool is the focus for the project.** Its purpose: help an advisor understand the supplied documents, identify missing information, and prepare the right follow-up questions.

The original idea is specific: extract the document dates and named people, summarize the relevant provisions, and let the advisor confirm whether they still reflect the client's circumstances. That is the center of the prototype.

Firm: **Raymond James.** The brief scores the work product, not the firm, but "fits the firm well" is part of Business Value, so keep a short fact sheet (scale from the 10-K, services and fees from Form ADV Part 2A, advisor and client counts, estate-planning offering, AI announcements).

## Advisor discussion prompts
The tool also analyzes the current makeup of the estate and flags tax exposure the advisor can raise with the client. It does not select legal structures or draft anything. Each prompt gives an observation, a quantified consequence under stated assumptions, trade-offs where an option exists, and an attorney-referral question.

Example shape: "A credit-shelter trust could reduce estimated federal estate tax by about $___ under [assumptions], but trade-offs include ___. Bring to the client's attention and refer to an estate attorney."

The panel's items: estate-tax threshold screen, portability election, Texas community-property basis step-up (IRC §1014(b)(6)), liquidity versus illiquid assets, and beneficiary-designation dollars at stake.

**Legal data approach.** Texas only. A curated rule pack of 10–15 hand-verified provisions, each with a citation and a "last verified" date, drawn from official sources (the Texas Legislature statutes site, IRS), not mirrors. Pulling "all" relevant law (an API data pull or scraping, plus an agent that checks periodically for new rulings) is a roadmap item, not part of the prototype. Estate and tax law change constantly and vary by state, so it is the largest sink in time, complexity, token usage, and accuracy risk.

**UPL boundary.** UPL means unauthorized practice of law. The tool makes no recommendations in the legal scope. It talks to the advisor, offers observations, quantified tax or financial consequences, and attorney-referral questions, and always ends with: "Not a substitute for the advice of an attorney." It never calls a provision void or invalid, never drafts clause language, and never says which legal instrument a client should adopt.

## Flowchart
A flowchart that clearly defines the flow of assets, so the client or advisor can visualize the structure of the estate plan. Prior art exists (RightCapital's estate flow chart, Wealth.com's flowcharts, Vanilla's guidance), so it is not claimed as novel. No formal notation standard exists for estate diagrams, so the chart carries its own legend:
- **Layout:** assets on the left, instruments in the middle, beneficiaries on the right, in probate and non-probate lanes (beneficiary designations bypass the will).
- **Nodes:** person, trust, account or asset. **Role labels:** grantor, trustee, successor trustee, beneficiary.
- **Edges:** will, trust, beneficiary designation, title or TOD.
- **Status colors:** confirmed, flagged, unresolved.

## Security
For the demo: synthetic data only, labeled. The site runs on GitHub Pages with precomputed results, no live uploads, and no API key in the page. For the roadmap, a one-page threat model: no real client data in public AI tools, zero-retention or enterprise API terms (check each model's retention requirements), PII redaction before model calls, encryption and tenant isolation, audit logs, and the regulatory frameworks to name and verify (GLBA Safeguards Rule, SEC Regulation S-P).

**The product promise should be: "Turn a client's estate documents into an evidence-backed advisor review."**

The workflow has five steps:

| Step | What the tool does | What the advisor sees |
|---|---|---|
| Upload | Accepts documents and a short client questionnaire | Inventory of supplied documents and missing inputs |
| Extract | Identifies dates, parties, roles, and key provisions | Structured facts linked to the supporting page |
| Reconcile | Compares documents, amendments, and client answers | Potential inconsistencies and unresolved questions |
| Review | Organizes findings by importance and evidence | Items to confirm with the client or refer for professional review |
| Export | Produces a concise review packet | Summary, findings, sources, and follow-up checklist |

## Analysis beyond summarization
- **People and roles:** "This document names Alex as successor trustee. Your questionnaire identifies Alex as deceased. Confirm whether a later appointment exists."
- **Document chronology:** "An amendment changes this provision. Here are the original and amended passages." Ambiguous precedence should remain unresolved.
- **Client intentions:** "Your stated intended beneficiaries differ from those named in this document."
- **Missing evidence:** "The packet contains a trust, but no supplied ownership records establish which assets are titled to it."
- **Review timing:** "The document predates the marriage reported in the questionnaire." Document age alone should not produce a conclusion that it is invalid or unsuitable.

Each finding includes **the observation, supporting evidence, uncertainty, and next question.** That structure makes the output useful and testable.

## Competition commitments
- One jurisdiction (Texas).
- A will, a revocable trust, one amendment, beneficiary designations, titling records, a short questionnaire (family changes, intended beneficiaries, available documents), and a small asset inventory connecting document findings to their financial significance.
- An advisor dashboard, flowchart, and downloadable review report.
- A second, clean household to demonstrate that the system does not manufacture problems.
- **Test data is user-sourced, not AI-generated.** Layer 1 (OCR and extraction): public datasets (FUNSD, VRDU, CUAD) and the user's own scans. Layer 2 (reconciliation): a clean Household B authored by the user, plus Household A variants produced by a mutation script that writes the answer key. All labeled SYNTHETIC.

Deferred until the document-review workflow is reliable: comprehensive estate-tax calculations, insurance recommendations, trust selection, retirement-distribution planning, Social Security optimization, Monte Carlo modeling.

## Strongest demonstration
A finding that requires connecting multiple sources. The headline scenario (hypothetical): an employer 401(k), an ERISA plan, still names a former spouse while the questionnaire reports divorce and remarriage, so about $22M across several accounts passes contrary to the client's stated intent. A plain summary might describe the trust correctly and miss it. The tool shows the relationship and lets the judge inspect the evidence immediately. The figure is the amount at stake from the synthetic inventory, not a predicted lawsuit outcome; label it hypothetical and never imply any real firm failed to catch it.

## Measurement
Extraction accuracy, material issues caught, false alarms, citation correctness (quote-verifier pass rate, digital and scanned reported separately), and review time. Any time savings must be measured in the demonstration (a manual review versus a tool-assisted review of the same household, labeled illustrative) rather than adopting the call transcript's proposed reduction as an established result.

## Competitive case
Estate software already analyzes documents: Wealth.com (Ester), Vanilla, Luminary and Trust & Will, and RightCapital draws estate flow charts. Document analysis itself is not novel. The competitive case is the quality of this focused workflow: how reliably it connects evidence, exposes uncertainty, and helps an advisor conduct a better client review. Verify competitors' public pages before claiming a differentiator, and do not contact them.

## Judges (for rehearsal only)
The `red-team` subagent uses role archetypes drawn from these backgrounds, not predictions of what any named person thinks.

- **Heba Kallas**, Customer Success Manager, LSEG. Specializes in financial data platforms, market intelligence solutions, and professional training.
- **Dr. Zhenhua Yu**, Founder, Generative AI for Kids. AI expert, former Tesla professional, and Georgia Tech Ph.D. with extensive experience in artificial intelligence and autonomous driving.
- **James A. White**, Private Client Manager, WPA Family Office & Private Wealth, LLC. Private wealth management professional focused on client relationships and wealth management services.
- **Jeffrey Green**, Chief People Officer, Allworth Financial. Senior executive specializing in talent strategy, organizational leadership, and people development within the financial services industry.
