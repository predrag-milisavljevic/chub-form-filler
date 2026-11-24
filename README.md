# CHub Form Filler (QA) — v1.3.3

Fills CommitteeHub submission forms with test data for manual testing. Works in Edge and Brave, in normal and private windows.

## Install (once per browser)
1. Unzip to a permanent folder. If you move or delete the folder, the extension stops working.
2. Open `edge://extensions` or `brave://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. For private windows, open **Details** and turn on **Allow in InPrivate** (Edge) or **Allow in Private** (Brave).
5. Optional: pin the extension. Shortcut: **Alt+Shift+F**.

**To update:** unzip the new version over the same folder, then click the reload icon on the extension card in each browser. Reload open CHub tabs too. No reset needed: from 1.3.1, the first time the popup opens it adds any new default settings to your saved settings and keeps your own values. The popup lists what it added. Old default New Hire dates (`From`/`To` still exactly as 1.3.0 shipped them) are replaced with the new ones; dates you changed are kept. A default key you delete yourself stays deleted until the next version upgrade adds it back; to turn a default off, set it to `"skip"`.

## Use
1. Create a new submission and select its **Type** yourself.
2. Wait until the form has loaded, open the extension and click **Fill form**. If you click it again while a fill is still running on that tab, the popup says so and doesn't start a second one.
3. Watch the **badge in the top-right corner of the page** (new in 1.3.3). It is there even if you close the popup:
   - **Blue** "filling…": the run is going. Click it to stop the run.
   - **Green** "done: N filled · 0 failed": the run is finished (pulses, then fades after 8 s).
   - **Red** "done: N filled · M failed (field names)": finished, but something needs a look. Stays until you click it.
   - **Amber** "stopped: …": the run ended early (see below). Stays until you click it.

   The badge is added to the page after the run starts and is only changed when the run ends; it is not part of the app's form.

**The run stops by itself** (new in 1.3.3) if the **Type** changes, or you leave the submission, while it is running. It then reports what it had filled so far and cancels any "Add" popup it opened. Before 1.3.3, changing the Type during a fill let the run carry on and fill the new, blank form. The app asks "All form data and attachments will be erased" when you change the Type; the filler stops as soon as the new Type is selected, before you answer that popup.

The extension:
- Reads the Type from the form and never changes it. Type-specific overrides use that Type text.
- Fills **Subtype** if it's empty and confirms CHub's popup. A Subtype change resets the form data.
- Never touches **Business Unit** (`skipLabels`), because changing it also resets the form data.
- Fills every other visible field, in up to 3 passes so fields that appear after an answer are filled too. When the page goes quiet it scans once more, then keeps watching for `lateScanMs` (default 2 s; it was 8 s in 1.3.1–1.3.2) and fills any fields that appear, in case the form body rendered after the header. On a slow network set `lateScanMs` to 8000; set 0 to switch this off.
- At the end, after one quiet period, re-checks every field it filled and re-fills any value the app dropped while re-drawing the form after a save. The report lists these under "Re-filled". A value that is still empty after the re-fill is reported under Failed. A field that can't be found at that moment (form mid re-draw) is waited for up to 1.5 s before it is judged. **Known issue:** Date Of Appointment (Internal Secondment, External Transfer) is sometimes empty after the run while the report says 0 failed (BACKLOG #11). After filling those types, check that field or click Fill again.
- Forms without a Practical Experience table skip the extra waiting that table needs (1.3.3).
- **List fields** (bidders, suppliers, savings summary, renewal/variation history…): clicks Add, fills the popup, and clicks Save, until the list has `listRows` rows (default 2). One row is accepted when a second can't be added. If Save stays disabled, it reports the invalid popup fields and cancels.
- **Practical Experience** (New Hire): adds `practicalRows` inline rows (default 2) and fills them. The rows are added only after the form has been quiet for a while and re-checked afterwards, because a row added while saves are still in flight is dropped when the form re-draws. At the very end it counts the rows again and reports "Practical Experience (N of 2 row(s) after final check)" under Failed if a late re-draw dropped one. New Hire dates: row 1 = 520 → 290 days ago (230 days), row 2 = 270 → 20 days ago (250 days). The app shows 7m + 8m = 1y 3m in total (chub-dev, 2026-11-24).
- **RFP Chronology**: fills each row's date and remarks.
- **File uploads** (attachments, New Hire photo) are skipped and shown as "file upload (not supported)" under Skipped.
- Never clicks Route and never uploads files.

## Default values
| Field kind | Value |
|---|---|
| Text | `QA {label} {stamp}`; Subject `QA {type} {stamp}`; labels ending in "No." / "Number" get a 7-digit number |
| Textarea | `QA test text for {label} ({type}) {stamp}` |
| Rich text | 4 lorem ipsum paragraphs, the first one prefixed with `{label}:` |
| Number | 5 (kept within min/max) |
| Decimal | 1,000.00 (typed as digits, the currency mask handles the format) |
| Percentage split | left 60 (the right side is calculated) |
| Date | today, or the nearest enabled day; typed if the calendar doesn't open |
| Time | 10:00 |
| Dropdown / Yes-No / Radio | first option |
| Checkbox | ticked |

**Label rules** (`labelRules`, case-insensitive regex matched against the field label; first match wins):
| Label matches | Value |
|---|---|
| ends with "No." or "Number" (RFP No., PO No., Agreement No., …) | random 7-digit number |
| email | qa.test@example.com |
| date of birth | 15/06/1990 (typed) |
| end date | today + 365 × n (the 1st End Date +365, the 2nd +730, …), so durations aren't 0 |
| salary | 15000 |
| years | 5 |
| icv | 40 |
| technical / commercial (exact) | 80 |

## Settings (JSON in the popup)
- `overrides`: values per field label, for every type (`"*"`) or for one type only. They win over `labelRules`; type-specific beats `"*"`.
  - Text, textarea, rich text: the value. A list of strings for rich text gives one paragraph per item. Placeholders: `{label}` `{type}` `{stamp}` `{n7}` (random 7-digit number, never starting with 0; any digit count works).
  - Dropdown: the option text to pick, also used as the search term for API-backed and user-search fields.
  - Date: `today`, `first`, `dd/mm/yyyy`, `+N` / `-N` (days from today), or `+N*n` (N × the occurrence number of that label). Checkbox: `true`/`false`. Radio: the option text. `"skip"` leaves the field untouched.
  - **A list gives one value per occurrence of the label** (1st, 2nd, …; the last value repeats), for every field kind except rich text, where a list is one paragraph per item. Example: `"From": ["-520", "-270"]`, or `"Remarks": ["First", "skip"]` to fill only the 1st Remarks. Up to 1.3.0 this worked for dates only. Fields inside list popups and RFP Chronology rows always get the 1st value.
- `listRows`: rows to add to list fields. `practicalRows`: rows to add to the Practical Experience table (falls back to `listRows`). `lateScanMs` (new in 1.3.3, default 2000): how long to keep watching for late-rendering fields after the first scans. `overwrite`: refill fields that already have a value. `onlyRequired`: fill only ★ fields. `pick`: `first` or `random`. `delayMs`: pause between fields.
- `typeLabel`, `subtypeLabel`, `skipLabels`: labels as shown in the UI. Change these when testing in Arabic.

Settings are shared between normal and private windows. They are not synced between browsers: copy and paste the JSON to move them.

## Not supported
Attachments, the New Hire photo, and other file uploads.

## Known limits
- The company network rejects rich text that starts with "(" (403), and the app then silently reverts the field. The filler never starts a rich text line with "(".
- Disabled or calculated fields (Shortfall, Duration, % To Original, Total Duration, …) are skipped; their values come from the fields they depend on.
- Changing the Type on a draft that already has data wipes the data at a moment the page doesn't show. Fill right after selecting the Type on a new submission, not after switching Type on a filled one.
- The badge sits over the top-right of the page header (search / help icons) while it is shown.

## Test results v1.3.3 (chub-dev, 2026-11-24, HR only)
Same method as the earlier results below: HR secretary in Claude's built-in browser, `filler.js` run in the page (not the installed extension; the popup/toolbar path is not covered), each type on a fresh submission, reload the submission from the server, compare every field by position. The page copy was the pushed v1.3.2 plus the 1.3.3 changes, checked byte-for-byte (SHA-256) against the local file; the only later edit is the `lateScanMs` default 3000 → 2000, which the test settings passed explicitly. PC types were not run.

| # | Type | Draft | Filled | Skipped | Failed | Lost after reopen | Empty after reopen | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | Promotion Requests | 100560 | 1 | 4 | 0 | 0 | 0 | pass |
| 2 | Termination/Contract Non-Renewal Requests | 100561 | 1 | 4 | 0 | 0 | 0 | pass |
| 3 | Internal Transfer Requests | 100562 | 16 | 5 | 0 | 0 | 0 | pass |
| 4 | New Hire Requests | 100559 | 32 | 9 | 0 | 0 | 0 | pass |
| 5 | Internal Secondment Requests | 100556 | 16 | 5 | 0 | 0 | 0 | pass |
| 6 | Termination/Restructuring Requests | 100566 | 1 | 4 | 0 | 0 | 0 | pass |
| 7 | External Transfer Requests | 100563 | 17 | 5 | 0 | 0 | **1** | **fail** |
| 8 | External Secondment Requests | 100564 | 15 | 5 | 0 | 0 | 0 | pass |
| 9 | Deputization Requests | 100565 | 16 | 5 | 0 | 0 | 0 | pass |
| 10 | Other | 100567 | 4 | 4 | 0 | 0 | 0 | pass |

Tally: 10 types; 9 pass, 1 fails (7). Repeats with `lateScanMs` 2000: Internal Transfer 100568 and Other 100569, both pass. That makes 12 reopened runs: 11 pass, 1 fail.
- **Failure (7):** Date Of Appointment was empty 3 s after the run and after reopen; the run counted it as filled and the green badge said "0 failed". Same bug as BACKLOG #11, now seen on a third run and a second type. **Not fixed.**
- **New Hire:** 2 Practical Experience rows after reopen, total Years Of Experience 1y 3m.
- **Type change during a run:** Internal Secondment (100558): switching the Type to New Hire about 4 s into the run stopped it at once: amber badge "stopped: Type changed during the fill (was Internal Secondment Requests, now New Hire Requests). 6 field(s) were filled before that", lock released. I cancelled the app's confirmation popup afterwards.
- **Click to stop:** clicking the blue badge stopped a run ("you clicked the banner", 6 fields filled), and clicking the amber badge dismissed it.
- **Badge:** blue while running, green on finish (seen in screenshots), 12 runs showed "done … 0 failed" including run 7, where the date was in fact missing. Red (failures) was not triggered by any run.
- **Settings upgrade (Node test, not in a browser profile):** a saved 1.3.2 config gets `lateScanMs` added, your own values are kept.
- **Not tested:** the popup's new "STOPPED" text, the badge inside the installed extension, the PC types.

**Run time** (seconds from clicking Fill until 3 s after the run ended, same method in both columns; the "before" values are the v1.3.1 runs of the same day (not shown in the tables below), Internal Secondment is the average of the 9 v1.3.2 runs):

| Type | before | 1.3.3 |
|---|---|---|
| Promotion | 19 | 10 |
| Termination/Contract Non-Renewal | 18 | 10 |
| Internal Transfer | 42 | 28 |
| New Hire | 62 | 54 |
| Internal Secondment | 48 | 32 |
| External Transfer | 42 | 34 |
| External Secondment | 48 | 30 |
| Deputization | 49 | 32 |
| Termination/Restructuring | 18 | 9 |
| Other | 38 | 15 |
| Sum | 384 | 254 |

Faster by 8–23 s per run, about a third overall. After the form stops changing, the run keeps going for 4.5–6 s (8 s on New Hire), measured from the last visible value change to the end. I didn't measure that on the old versions. New Hire keeps its longer tail on purpose: the 2.5 s quiet period before and after adding Practical Experience rows is what stops late saves from dropping them.

## Test results v1.3.2 (chub-dev, 2026-11-24, HR only, partial)
Same method as below (`filler.js` v1.3.2 and its default settings run in the page; the byte-identical file was checked by SHA-256 against the local one). Only two types were run:
- **Internal Secondment Requests, 9 fresh drafts (100495–100503):** 8 clean, **1 failed (100498)**: Date Of Appointment empty 3 s after the run and after reopen, report said 0 failed. The first 7 runs (100495–100501) were reopened and compared: 6 had 0 failed, 0 lost, 0 empty; 100498 had 1 empty. The last 2 (100502, 100503) were only checked in the open form 5 s after the run, without reopening. Two runs (100496, 100500) re-filled a dropped rich text field. **Not fixed**, see BACKLOG #11.
- **New Hire Requests (100504):** 32 filled, 9 skipped, 0 failed; after reopen 0 lost, 0 empty, 2 Practical Experience rows, total 1y 3m. Same as v1.3.1.
- Not run on v1.3.2: the other 8 HR types and all PC types.

## Test results v1.3.1 (chub-dev, 2026-11-24, HR only)
Signed in as HR secretary in Claude's built-in browser. `filler.js` and `DEFAULT_CFG` were loaded from commit `4b777a3` and run in the page (the unpacked extension itself was not installed; the popup's toolbar click path is not covered). Each row is a new submission: select the Type, run the filler, leave the form, reload the submission from the server, compare every field by position. PC types were not run (they need the PC secretary account).

| # | Type | Draft | Filled | Skipped | Failed | Lost after reopen | Empty after reopen | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | Promotion Requests | 100484 | 1 | 4 | 0 | 0 | 0 | pass |
| 2 | Termination/Contract Non-Renewal Requests | 100485 | 1 | 4 | 0 | 0 | 0 | pass |
| 3 | Internal Transfer Requests | 100486 | 16 | 5 | 0 | 0 | 0 | pass |
| 4 | New Hire Requests | 100483 | 32 | 9 | 0 | 0 | 0 | pass |
| 5a | Internal Secondment Requests | 100487 | 16 | 5 | 0 | 0 | **1** | **fail** |
| 5b | Internal Secondment Requests (repeat) | 100488 | 16 | 5 | 0 | 0 | 0 | pass |
| 6 | Termination/Restructuring Requests | 100489 | 1 | 4 | 0 | 0 | 0 | pass |
| 7 | External Transfer Requests | 100490 | 17 | 5 | 0 | 0 | 0 | pass |
| 8 | External Secondment Requests | 100491 | 15 | 5 | 0 | 0 | 0 | pass |
| 9 | Deputization Requests | 100492 | 16 | 5 | 0 | 0 | 0 | pass |
| 10 | Other | 100493 | 4 | 4 | 0 | 0 | 0 | pass |

Tally: 10 types, 11 runs; 10 runs pass, 1 run fails (5a). By type: 9 of 10 passed on the first run; Internal Secondment passed on the repeat.
- **5a:** Date Of Appointment (required date) was reported as filled, but was already empty 3 s after the run ended and stayed empty after reopen. The filler reported 0 failed, so its final re-check didn't see the drop. Re-running the filler on the same draft filled it and it was saved. The repeat on a fresh draft (5b) passed. Intermittent; see BACKLOG #11.
- **New Hire:** 2 Practical Experience rows after reopen; rows show 7m and 8m, **Total Years Of Experience 1y 3m** (BACKLOG #5 confirmed). The report had one "Practical Experience (2 row(s) after final check)" line.
- **Second run while one is running (BACKLOG #1):** calling `run()` again 3 s into the New Hire run returned "A fill is already running on this tab…"; the first run finished normally.
- Not checked: the late-rendering form body under network throttling (#2), array overrides other than the New Hire dates (#6), the settings merge in a real browser profile (#4; checked in Node only).

## Test results (chub-dev, 2026-11-20)
Results from v1.2.9 (PC) and v1.3.0 (HR).


**PC (v1.2.9):** all 9 types (Award Recommendation, Contract Renewal, Contract Termination, Contract Extension, Sourcing Strategy, Tender Cancellation, Contract Variation, Contract Administrator Change, Other), every fillable field saved after a page reload.

**HR (v1.3.0), signed in as HR secretary.** Each row is a new submission: select the Type, run the filler, leave the form and reopen it, compare every field by position.

| # | Type | Filled | Skipped | Failed | Lost after reopen | Empty after reopen |
|---|---|---|---|---|---|---|
| 1 | Promotion Requests | 1 | 4 | 0 | 0 | 0 |
| 2 | Termination/Contract Non-Renewal Requests | 1 | 4 | 0 | 0 | 0 |
| 3 | Internal Transfer Requests | 16 | 5 | 0 | 0 | 0 |
| 4 | New Hire Requests | 32 | 9 | 0 | 0 | 0 |
| 5 | Internal Secondment Requests | 16 | 5 | 0 | 0 | 0 |
| 6 | Termination/Restructuring Requests | 1 | 4 | 0 | 0 | 0 |
| 7 | External Transfer Requests | 17 | 5 | 0 | 0 | 0 |
| 8 | External Secondment Requests | 15 | 5 | 0 | 0 | 0 |
| 9 | Deputization Requests | 16 | 5 | 0 | 0 | 0 |
| 10 | Other | 4 | 4 | 0 | 0 | 0 |

- Promotion, Termination/Contract Non-Renewal and Termination/Restructuring have only the header fields (Subject, Type, Subtype, Business Unit, Decision Type, Urgency) plus attachments; Subject is the only field to fill. Decision Type is read-only ("For Approval"), Subtype is disabled ("General"), Urgency has a default.
- New Hire: 2 Practical Experience rows saved, the app shows 6m per row and "Total Years Of Experience 1y".
- The HR Type list has 10 entries: the 9 above plus Other. The README before 1.3.0 called them HR 101–110; this run didn't map them to those numbers.

## Status & next session (as of 2026-11-20)
**Where we are:** v1.3.0 fills all 10 HR types on chub-dev (checked by reopening each submission). It is built from the files in this folder; to install, put the 5 files in one folder and use Load unpacked. Not yet installed in Pedja's Edge/Brave: the testing was done by injecting `filler.js` into the page, with the same settings as the new defaults.

**Decisions that shape the output:**
- The user creates the submission and selects the Type; the filler never changes Type, Business Unit or Route.
- Rich text: 4 lorem paragraphs, the first prefixed with `{label}:`.
- Reference fields ("… No."): 7-digit numbers, no text.
- Lists: 2 rows wanted, 1 row acceptable.
- Date of Birth: typed 15/06/1990.
- New Hire: skip the photo; Practical Experience = 2 rows, total at least 1 year plus a couple of months (1.3.1 dates aim for 1y 3m).
- The 403 on rich text starting with "(" (company network) and the "Procurement reference details could not be found" toast (integration) are expected. Don't report them.

**App quirks learned (don't rediscover):**
- A save re-draws the whole form and drops values (and inline Practical Experience rows) still saving; the filler re-checks and re-fills at the end.
- ng-select here has no `ng-has-value` class: check for `.ng-value`.
- Currency mask (ng2-currency-mask): typed digits count as cents, so type the value ×100 via keypress; clear with select-all + Backspace.
- TinyMCE: use `dispatch`, not `fire`. A typed PrimeNG date commits on blur (keydown first, so the field knows it's being typed).
- Changing Type, Subtype or Business Unit resets the form data (confirmation popup).
- The Practical Experience table is `lib-practical-experience-table-form`: the "Add an Experience Entry" button is `button.btn--border`, rows are `.formly-group-table` direct children of the component.
- The field catalog per type comes from `json/config-backup.json` (HR) and `json/updated-pcms-config.json` (PC) in the app repo. Not read in this session: the HR field lists above come from the live forms.

**Open:**
- Brave and private windows: not yet tested by Pedja.
- Sourcing Strategy "Select field" stays disabled; what unlocks it is unknown. Low priority.
- Delete the QA test Drafts on chub-dev (from 100438 upward; the HR runs created 100460–100473 and re-used drafts in between).
- The form-body-renders-late scan was added after one run where only the header was filled; the next run passed, but a repeat of the slow case hasn't been observed.

**Opener:** `Read claude/form-filler-v1.3.0/README.md (Status & next session), then install v1.3.0 in my Edge and check Brave and a private window.`
