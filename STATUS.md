# Status

Update this file at the end of every work session.

## Current phase
Project setup. Scaffold files and logging hooks created. Firm chosen: Raymond James. No product code yet.

## Next steps
1. Raymond James fact sheet: scale (10-K), services and fees (Form ADV Part 2A via SEC IAPD), advisor and client counts, estate-planning offering, AI announcements. Cite every item.
2. User gathers Layer 1 documents (FUNSD, VRDU, CUAD, own phone scans of hand-filled public Texas forms) and builds Household B (clean) by hand.
3. Build `verify_quotes.py` and the extraction step (strict tool schema with `quote` and `page`).
4. Build the mutation script (each mutation plants one issue; the script writes the answer key).
5. Reconciliation rules, then `run_eval.py`.
6. Dashboard, Mermaid flowchart, review packet, GitHub Pages (precomputed results only).
7. Business-case page, time study (label illustrative), demo recording, one-page AI log.

## Decisions log
- Firm: Raymond James.
- Cut: math engine (Capital Needs, Social Security, Monte Carlo); live law scraping.
- Agent 4 replaced by Claude Code hooks writing `ai_log/*.jsonl`. Agent 5 is the on-demand `red-team` subagent (role archetypes, not named judges).
- Naming: "Estate Document Review" (no "Fiduciary").
- Headline number: "$22M passing to a former spouse contrary to stated intent" (hypothetical, derived from the synthetic inventory; ERISA 401(k) scenario spread across accounts).
- Tax options may name a structure (e.g. credit-shelter trust) with quantified savings and trade-offs, then attorney referral. Conditional language only. Savings are deterministic; trade-offs come from a curated library.
- Test set is user-sourced, not AI-generated.
- Demo video is a screen recording from the GitHub Pages site; the video file is also uploaded to OneDrive per the brief.

## Final checklist
- [ ] Verify Texas Government Code §81.101(c) current text (software safe harbor and disclaimer wording).
- [ ] Verify every Texas rule-pack citation against the statutes.
- [ ] Verify *Egelhoff v. Egelhoff* and the Texas Family Code treatment of former-spouse designations.
- [ ] Verify the estate-tax example math and the $15M exclusion against IRS sources.
- [ ] Confirm the disclaimer appears on the dashboard, packet, and in the video.
- [ ] Confirm "hypothetical" labels on the $22M scenario everywhere it appears.
- [ ] Check FUNSD and RVL-CDIP license terms; cite every dataset used.
- [ ] Confirm `git` history shows work started after Oct 25, 10 AM.
- [ ] Video 5 minutes or less, in your own voice, uploaded to OneDrive.
- [ ] One-page AI log PDF: decision fields completed by you, at least two checks shown.
- [ ] Files named `Last_First_RaymondJames_Video/Deliverable/AILog`, shared with `jsomfinlab@utdallas.edu`, links tested, Microsoft Form submitted before 11:59 PM.
