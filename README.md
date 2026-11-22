# CHub Form Filler (QA) — v1.3.0

Fills CommitteeHub submission forms with test data for manual testing. Works in Edge and Brave, in normal and private windows.

## Install (once per browser)
1. Unzip to a permanent folder. If you move or delete the folder, the extension stops working.
2. Open `edge://extensions` or `brave://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. For private windows, open **Details** and turn on **Allow in InPrivate** (Edge) or **Allow in Private** (Brave).
5. Optional: pin the extension. Shortcut: **Alt+Shift+F**.

**To update:** unzip the new version over the same folder, then click the reload icon on the extension card in each browser. Then open the popup, go to Settings and click **Reset to defaults** (the saved 1.2.x settings don't have `practicalRows` or the New Hire date overrides). Re-add your own overrides after.

## Use
1. Create a new submission and select its **Type** yourself.
2. Wait until the form has loaded, open the extension and click **Fill form**. Keep the popup open until the report appears.

The extension:
- Reads the Type from the form and never changes it. Type-specific overrides use that Type text.
- Fills **Subtype** if it's empty and confirms CHub's popup. A Subtype change resets the form data.
- Never touches **Business Unit** (`skipLabels`), because changing it also resets the form data.
- Fills every other visible field, in up to 3 passes so fields that appear after an answer are filled too. When the page goes quiet it scans once more, in case the form body rendered after the header.
- At the end, re-checks every field it filled and re-fills, once, any value the app dropped while re-drawing the form after a save. The report lists these under "Re-filled".
- **List fields** (bidders, suppliers, savings summary, renewal/variation history…): clicks Add, fills the popup, and clicks Save, until the list has `listRows` rows (default 2). One row is accepted when a second can't be added. If Save stays disabled, it reports the invalid popup fields and cancels.
- **Practical Experience** (New Hire): adds `practicalRows` inline rows (default 2) and fills them. The rows are added only after the form has been quiet for a while and re-checked afterwards, because a row added while saves are still in flight is dropped when the form re-draws. New Hire dates: row 1 = 450 → 240 days ago, row 2 = 230 → 20 days ago (about 6 months each, 1 year in total as the app shows it).
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
  - Date: `today`, `first`, `dd/mm/yyyy`, `+N` / `-N` (days from today), or `+N*n` (N × the occurrence number of that label). **New in 1.3.0:** a list, e.g. `["-450", "-230"]`, gives one value per occurrence of the label (1st, 2nd, …); the last value repeats. Checkbox: `true`/`false`. Radio: the option text. `"skip"` leaves the field untouched.
- `listRows`: rows to add to list fields. `practicalRows` (new): rows to add to the Practical Experience table (falls back to `listRows`). `overwrite`: refill fields that already have a value. `onlyRequired`: fill only ★ fields. `pick`: `first` or `random`. `delayMs`: pause between fields.
- `typeLabel`, `subtypeLabel`, `skipLabels`: labels as shown in the UI. Change these when testing in Arabic.

Settings are shared between normal and private windows. They are not synced between browsers: copy and paste the JSON to move them.

## Not supported
Attachments, the New Hire photo, and other file uploads.

## Known limits
- The company network rejects rich text that starts with "(" (403), and the app then silently reverts the field. The filler never starts a rich text line with "(".
- Disabled or calculated fields (Shortfall, Duration, % To Original, Total Duration, …) are skipped; their values come from the fields they depend on.
- Changing the Type on a draft that already has data wipes the data at a moment the page doesn't show. Fill right after selecting the Type on a new submission, not after switching Type on a filled one.

## Test results (chub-dev, 2026-11-20)
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
- New Hire: skip the photo; Practical Experience = 2 rows of about 6 months each (1 year in total).
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
