# CHub Form Filler — instructions for Claude Code

Browser extension (Manifest V3, Edge/Brave) that fills CommitteeHUB submission forms with test data for manual QA. Owner: Pedja (QA Lead). Current version: **1.3.2**. Read `README.md` for user-facing behavior and `BACKLOG.md` for open work.

## Files
- `manifest.json`: MV3 manifest; `version` must match the version string in `filler.js` and `popup.js`.
- `filler.js`: injected into the page's MAIN world (needs `window.tinymce`). Exposes `window.__chubFiller = { run, version }`. It re-injects only when the version differs, so **bump the version on every code change** or an old copy stays in open tabs until reload.
- `popup.js` / `popup.html`: Fill button, report, settings JSON (stored in `chrome.storage.local`), `DEFAULT_CFG`.
- `README.md`: user docs plus the test results table. Update it with every release.

## Rules
- **Never change Type, Business Unit, or click Route. Never upload files.** The user creates the submission and selects the Type. Changing Type, Subtype or Business Unit resets the form data.
- Edit files in place. Each release = a version bump in all three places + a README update + a git commit. After each change, list exactly what changed and confirm nothing else did.
- Don't create new files unless asked (tests and scripts under `tests/` are fine once Pedja approves the test task).
- Tag claims about app behavior: `[source: …]` when it comes from code, a log or a test run; `[inferred]` otherwise. Anything inferred that a fix depends on goes under "To verify" in your reply.
- Counts (types, fields, passes): compute them from an explicit list and show the tally.
- Never put credentials in files, commits or replies. Read chub-dev login from environment variables (e.g. `CHUB_USER`, `CHUB_PASS`), never hard-code them.
- Report only what a test run shows. Don't reuse old pass-table wording if the new results differ.

## Decisions that shape the output (agreed with Pedja)
- Rich text: 4 lorem paragraphs, the first prefixed with `{label}:`. Never start a rich text line with "(": the company network returns 403 and the app silently reverts the field.
- Reference fields ("… No." / "… Number"): random 7-digit number, no text.
- List fields (bidders, suppliers, …): 2 rows wanted, 1 row acceptable.
- Date of Birth: typed 15/06/1990.
- New Hire: skip the photo. Practical Experience = 2 rows; the total should show **at least 1 year plus a couple of months** (v1.3.0 gave 6m + 6m = "1y"; v1.3.1 uses 230 + 250 days, shows 7m + 8m = 1y 3m, confirmed on chub-dev 2026-11-24).
- Expected noise, don't report: the 403 on rich text starting with "(", and the "Procurement reference details could not be found" toast (integration).

## App quirks (don't rediscover)
- Stack: Angular + formly + ng-select + PrimeNG + TinyMCE. Field wrappers are `.f`, labels `:scope > .semi-bold-XS-label > span`, required marker `.sup`.
- A save re-draws the whole form and drops values (and inline Practical Experience rows) that were still saving. The filler re-checks every filled field at the end and re-fills once.
- ng-select has no `ng-has-value` class: check for `.ng-value`.
- Currency mask (ng2-currency-mask): typed digits count as cents, so type value × 100 via keypress; clear with select-all + Backspace.
- TinyMCE: use `ed.dispatch`, not `fire`. Typed PrimeNG dates commit on blur; send a keydown first so the field knows it's being typed.
- Practical Experience: `lib-practical-experience-table-form`, add button `button.btn--border` ("Add an Experience Entry"), rows are `.formly-group-table` direct children. Rows must be added only after the form has been quiet, or a late save drops them.
- Switching Type on a draft that already has data wipes it at a moment the page doesn't show (stale values stay visible). Test each type on a **fresh** submission, never by switching Type on a filled draft.
- Field catalogs live in the app repo: `json/config-backup.json` (HR), `json/updated-pcms-config.json` (PC).

## Environments
- chub-dev: https://chub-dev.rationaletech.com, password login via `/login?passwordLogin=true`. HR and PC submissions need different secretary accounts (HR secretary for HR types, PC secretary for PC types). chub-dev has no WAF; content-based 403s come from the company network.

## Types to cover
- HR (10): Promotion Requests, Termination/Contract Non-Renewal Requests, Internal Transfer Requests, New Hire Requests, Internal Secondment Requests, Termination/Restructuring Requests, External Transfer Requests, External Secondment Requests, Deputization Requests, Other.
- PC (9): Award Recommendation, Contract Renewal, Contract Termination, Contract Extension, Sourcing Strategy, Tender Cancellation, Contract Variation, Contract Administrator Change, Other.

## Regression test (pass criteria)
Per type, on a fresh submission: select the Type, run the filler, leave the form and reopen it, compare every field by position. Pass = 0 failed, 0 values lost after reopen, 0 fillable fields empty after reopen (read-only, disabled and upload fields excluded). New Hire additionally: 2 Practical Experience rows after reopen.
