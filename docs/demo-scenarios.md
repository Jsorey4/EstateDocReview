# PDF scenario demonstration

Only PDFs from Case1, Case2, and Case3 are used. DOCX files and Template_Case folders are excluded. The original uploaded PDFs remain unchanged. Choosing a case from any picker loads it and opens its questionnaire on step 1, already complete (5 of 5), as the example client's answers. The answers were prepared from the PDFs; the discrepancies below were explicitly authorized by the user and are the only intentional differences. Marriage dates are not in the documents and remain blank. The questionnaire as-of date is 2026-10-26.

## Demonstration cases

- Case 1 / Pendelton: the questionnaire names Julian M. Pendelton as executor; the will names Eleanor Vance Pendelton, with Julian as alternate (the quote includes both roles). All six asset beneficiaries match quoted passages in the TOD deed and the beneficiary schedule, so the Estate flow shows them verified with no false alarm. `public/examples/case1-clean.json` keeps the consistent baseline (zero findings).
- Case 2 / Montgomery: (a) authorized 2026-10-26: the questionnaire names Julian M. Montgomery as executor; the pour-over will names Eleanor Vance Montgomery, with Julian as successor. (b) The uploaded trust names Julian M. Montgomery as first successor trustee; the separate demo copy of the certificate names Beatrice Vance before Clara Vance. Both passages appear as unresolved trustee records, even with a blank questionnaire trustee answer. The original certificate is unchanged. The changed PDF is `public/examples/pdfs/Case2_Certificate_Demo_Discrepancy.pdf`; page 2 includes a demo-variant footer. No legal precedence is inferred.
- Case 3 / Thorne: authorized 2026-10-26: the questionnaire names Alistair C. Thorne as trustee; the ILIT, SLAT/Dynasty trust, GRAT, and CRT each name Samuel T. Sterling (four quoted passages). Partnership, tax, insurance, and charitable terms are outside the implemented comparison coverage. The FLP value shown ($5,850,000) is the contributed asset value on Schedule A, not a current valuation.

## Preparation and limits

Run `.venv/bin/python -m bridge.build_case_workspaces` to regenerate the three payloads and the Case 1 baseline. This copies actual PDFs, extracts page text with pypdf, and checks explicitly selected executor, trustee, and Case 1 asset-beneficiary facts (14 in total) with `legacy.verify_review_packet_v1.verify`. The browser repeats the legacy exact quote check. These are curated, mechanically quote-checked records, not results of the LLM extraction pipeline and not a comprehensive analysis. The full original text of all 16 documents is available for inspection.

Missing balances use zero placeholders with an explicit asset note, not invented valuations; the interface shows them as "Not stated", never $0. Marriage dates remain blank. People named in the documents are recorded as living. The questionnaire is marked reviewed so each case opens complete. Source hashes are included. Internal provenance is preserved.

Dark mode is a persistent toolbar choice, initially following the operating system. It applies to screen views; printed packets remain light. Regenerate component color overrides after stylesheet changes with `node scripts/build-dark-theme.mjs`, then format src/dark.css. Hand-tuned rules (brand variables, green fills, hero) live in `scripts/dark-overrides.css`; never edit src/dark.css directly.
