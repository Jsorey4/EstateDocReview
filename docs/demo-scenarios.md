# PDF scenario demonstration

Only PDFs from Case1, Case2, and Case3 are used. DOCX files and Template_Case folders are excluded. The original uploaded PDFs remain unchanged. The interface opens PDFs from its document viewer and prefills the questionnaire from a curated reading of the PDF content; this is not an independent client interview.

## Demonstration cases

- Case 1 / Pendelton: the user authorized a questionnaire executor of Julian M. Pendelton while the will names Eleanor Vance Pendelton. The original PDF is unchanged. `public/examples/case1-clean.json` retains the consistent questionnaire baseline; the default case1 payload demonstrates the mismatch.
- Case 2 / Montgomery: the uploaded trust names Julian M. Montgomery as first successor. The separate demo copy of the certificate names Beatrice Vance before Clara Vance. Both passages appear in the review as unresolved trustee records, even with a blank questionnaire trustee answer. The original certificate is unchanged. The changed PDF is `public/examples/pdfs/Case2_Certificate_Demo_Discrepancy.pdf`; page 2 includes a demo-variant footer. No legal precedence is inferred.
- Case 3 / Thorne: prefilled household and asset details plus all six PDFs are available for inspection. The specialized partnership, tax, insurance, and trust provisions are outside the implemented name-comparison coverage. There are no curated comparison facts for this case; an empty queue is not proof of consistency.

## Preparation and limits

Run `.venv/bin/python -m bridge.build_case_workspaces` to regenerate the three payloads and the Case 1 baseline. This copies actual PDFs, extracts page text with pypdf, and checks four explicitly selected executor/trustee facts with `legacy.verify_review_packet_v1.verify`. The browser repeats the legacy exact quote check. These are curated, mechanically quote-checked records, not results of the LLM extraction pipeline and not a comprehensive analysis. The full original text of all 16 documents is available for inspection.

Missing balances use zero placeholders with an explicit asset note, not invented valuations. Unrecorded marital dates and as-of dates remain blank; living status is unknown. Questionnaire confirmation stays incomplete until reviewed. Source hashes are included. Internal provenance is preserved.

Dark mode is a persistent toolbar choice, initially following the operating system. It applies to screen views; printed packets remain light. Regenerate component color overrides after stylesheet changes with `node scripts/build-dark-theme.mjs`, then format src/dark.css. Hand-tuned rules (brand variables, green fills, hero) live in `scripts/dark-overrides.css`; never edit src/dark.css directly.
