# Design QA — dollar underline removal (2026-08-31)

## Evidence

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-c7a079c8-3b1a-4024-ae1e-ae43d1ab390b.png`
- Single source-versus-render comparison: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/comparison-source-vs-ten-sites.png`
- Remote jobs desktop render: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4201-desktop-full.png`
- Remote jobs mobile render: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4201-mobile-full.png`
- Focused desktop amount crop: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4201-desktop-amount.png`
- Focused mobile amount crop: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4201-mobile-amount.png`

## Findings

- No actionable P0, P1, or P2 findings remain for this scoped correction.
- The dollar sign and numeric value render with `text-decoration-line: none`; the amount wrapper and input both have `border-bottom-style: none` and `border-bottom-width: 0px`.
- Existing typography, spacing, buttons, project skin, and Waffo payment behavior are unchanged.
- Existing keyboard focus selectors remain in place; only the persistent dashed amount decoration was removed.
- At `390 x 844`, the amount control remains inside the viewport with no horizontal overflow.
- Increase/decrease interaction passed: `$5 → $6 → $5`.
- Chrome console errors: `0`.

## Comparison History

1. Source defect — a dashed line appeared directly below the dollar amount.
2. Fix — removed the amount wrapper/input underline or dashed bottom border without changing form geometry.
3. Post-fix evidence — desktop and mobile crops show the amount cleanly, while controls stay aligned and interactive.

## Verification

- `npm test`: passed, 0 failed.
- `git diff --check`: passed.
- Chrome desktop computed-style check: passed.
- Chrome `390 x 844` responsive computed-style and containment check: passed.
- Chrome amount stepper interaction and console checks: passed.

## Follow-up Polish

- None required for this scoped correction.

final result: passed

## Prelaunch public-copy cleanup — 2026-08-31

- Chrome routes checked: home, About, and Rules at the normal desktop viewport and `390 x 844`.
- Public copy contains no clone, development, test-fixture, internal field-name, or payment-provider implementation language.
- Claim controls share one visual centerline; amount decoration is clean and the step buttons stay inside their boxes.
- Responsive result: no horizontal document overflow on any checked route.
- Regression result: `npm test` passed `112/112`; `git diff --check` passed.
- Payment behavior remains unchanged; customer-facing wording is provider-neutral while Waffo stays internal.

## Maker contact footer · 2026-09-01

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-856d0520-4293-4865-a587-ff7cf0f23936.png` (`2400 x 1664`, browser chrome included).
- Browser-rendered implementation: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/01-desktop.jpg` (`1185 x 680`) and `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/01-mobile.jpg` (`375 x 812`). Chrome CSS targets were normal desktop and `390 x 844`; scrollbar space accounts for the captured `1185/375px` content widths. Density was normalized by cropping the footer regions into `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/desktop-comparison.jpg`.
- State: Backend lane, empty live board, maker-email link keyboard-focused.
- Full-view evidence: the source's low-priority author contact pattern is preserved at the page bottom and integrated into the hiring-wall footer rather than copied as a generic block.
- Focused evidence: one visible `data-maker-contact`; exact copy `Built by tangpingqingwa@gmail.com`; exact `mailto:tangpingqingwa@gmail.com`; `3px` visible focus outline; desktop and mobile horizontal overflow both `0px`.
- Required surfaces: hiring-wall monospace typography, grid rhythm, green paper tokens, and existing footer hierarchy remain coherent; no image or icon asset was needed; copy is standalone and public-facing.
- Findings: P0 `0`, P1 `0`, P2 `0`. The omitted source badge/legal links are an intentional scope difference—the requested author-contact affordance is complete.
- Comparison history: pass 1 found no actionable P0/P1/P2 difference, so no visual correction loop was required.
- Regression: `113/113` tests passed; payment/provider logic was not changed.

final result: passed
