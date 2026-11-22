# Backlog

From the static code review of v1.3.0 (2026-11-21). Items marked [inferred] are not yet confirmed in the live app.

## v1.3.1 — to fix
1. **No guard against two runs at once.** Alt+Shift+F can reopen the popup mid-run and start a second `run()` on the same form; overlapping fill loops corrupted test results before. Fix: `run()` returns an "already running" error while a run is active (clear the flag in `finally`). [inferred: that the shortcut reopens the popup mid-run]
2. **Late-rendering form body: the 1.3.0 fix is weak.** `waitIdle(1500)` + rescan can finish while the form template is still downloading (no DOM changes during the network wait), so the body still gets missed. Fix: after the main passes, poll for up to ~8 s for new field wrappers and fill any that appear. [inferred; reproduce with DevTools network throttling]
3. **Practical Experience rows not recounted at the end.** A re-draw after the retry loop's last check drops the rows while the report still says "2 row(s) added". Fix: final recount; report a failure if fewer than `practicalRows`.
4. **Saved 1.2.x settings give 0-day experience.** Old saved config has no New Hire date overrides (both dates = today). Fix: on load, deep-merge missing default keys into the saved config instead of only warning (keep the user's own values).
5. **New Hire dates show "1y", not 1y + a couple of months.** 450→240 and 230→20 days ago = 210 days per row; the app showed 6m per row and 1y in total (it seems to count whole calendar months [inferred]). Proposed: row 1 = `-520` → `-290`, row 2 = `-270` → `-20` (~7 + 8 months ≈ 1y 3m). Also fix the `popup.js` comment ("about 1 year 2 months") to match the result.
6. **Array overrides only work for dates.** For text/dropdown, `["a","b"]` becomes "a,b". Either support per-occurrence arrays for every kind or document "dates only" in the README.

## Minor
7. Report counts can be inflated: when a Practical Experience row is re-added, the "Inline table" line and the row's fields are reported again. README "Filled" numbers count fill actions, not unique fields.
8. `{nN}` only supports 1–9 digits (`{n10}` stays literal). README says "any digit count works": fix the wording or the regex.
9. Label rule `(\bno\.?|\bnumber)$` could match a Yes/No dropdown whose label ends in "…or No" → "option not found". [inferred: no such label seen yet]

## Test infrastructure
10. Playwright regression script: launch Chromium with the unpacked extension (persistent context, `--load-extension`), log in to chub-dev from env vars, run each type on a fresh submission per the pass criteria in CLAUDE.md, print a pass table. HR and PC need separate accounts.

## Open (not code)
- Brave and private windows: not tested by Pedja.
- Sourcing Strategy "Select field" stays disabled; what unlocks it is unknown. Low priority.
- Delete QA test drafts on chub-dev: 100438 upward, incl. 100460–100473 from the HR runs.
