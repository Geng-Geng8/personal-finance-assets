STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-12

# Personal Finance PWA — UI Screenshot Reference

**Owner:** Glen Reyes  
**Visual source priority:** current user-provided production screenshots → current authenticated production UI → current code.  
**Related UX brief:** `02_Product_and_UX_Brief.md`

## Evidence status

Current authenticated production screenshots are available in the project workspace. The most recent confirmed production image is an installed Android PWA capture from 2026-09-12 showing the expanded Wealth Accounts area after the Philippines release.

Do not use screenshots to infer formula status, write safety, or authoritative Sheet topology. Those facts come from current Apps Script code and `03_Google_Sheet_Data_Model.md`.

## Current screenshot index

| ID | Screen | Evidence status |
| --- | --- | --- |
| UI-00 | Device Setup Gate | Previously observed; architecture unchanged |
| UI-01 | Expenses | User-provided project screenshot available |
| UI-02 | Add Expense | User-provided project screenshots available |
| UI-03 | Spending Insights | User-provided project screenshot available |
| UI-04 | Wealth Top | User-provided project screenshot available |
| UI-05 | Wealth detail / investments | User-provided project screenshot available |
| UI-06 | Accounts Collapsed | Current code-defined reference |
| UI-07 | Accounts Expanded with Philippines | **CURRENT PRODUCTION SCREENSHOT — 2026-09-12** |
| UI-08 | Installed Mobile PWA | **CURRENT PRODUCTION SCREENSHOT — 2026-09-12** |

## UI-00 — Device Setup Gate

**Purpose:** authorize the owner's device without exposing finance data before setup.  
**Preserve:** single-task centered layout, masked key entry, explicit privacy language, clear primary action, no finance content before authorization.

## UI-01 — Expenses

**Purpose:** default authenticated transaction screen.  
**Key components:** monthly summary, search, filters, transaction list/cards, sync state, bottom navigation, central Add action.  
**Preserve:** fast mobile scanning, honest Live/Saved Data state, readable totals, easy access to Add Expense.

## UI-02 — Add Expense

**Purpose:** create or edit one transaction.  
**Key components:** amount, payment method, bucket, dependent category, date, item, notes, validation, Save.  
**Preserve:** large touch targets, one clear Save action, mobile keyboard usability, server-confirmed errors.

## UI-03 — Spending Insights

**Purpose:** explain spending without mutating data.  
**Key components:** Spending | Wealth segmented control, date range, totals, charts, breakdowns.  
**Preserve:** summary-before-detail hierarchy, legible charts, consistent filters, no write behavior from charts.

## UI-04 — Wealth Top

**Purpose:** answer how much cash is truly available after protected obligations.  
**Hierarchy:** Available Cash hero → Cash Position / Protected Reserves → investments → Crypto → Accounts.  
**Preserve:** Available Cash primacy and visual separation between spendable and protected money.

## UI-05 — Wealth Investments

**Purpose:** show registered investment totals separately from everyday liquidity.  
**Key components:** TFSA, FHSA, RRSP summaries plus separate Crypto card.  
**Preserve:** registered-investment grouping, Crypto separation, no direct editing of formula-driven summary totals.

## UI-06 — Accounts Collapsed

**Purpose:** keep detailed account balances subordinate to the main Wealth decisions.  
**Key components:** Accounts label, combined count, accordion chevron.  
**Current count:** **16 accounts**.  
**Preserve:** collapsed-by-default behavior and compact footprint.

## UI-07 — Accounts Expanded with Philippines

**Evidence:** current production installed-PWA screenshot captured 2026-09-12 after Apps Script Version 37 / application SHA `ca8f973226b2c0fa301326789c865d848006aa1f`.

**Current visible group order:**

1. **CASH**
2. **INVESTMENTS**
3. **PHILIPPINES**

**PHILIPPINES rows:**

- Cash — CAD
- Cash — PHP
- GoTyme
- GCash

**Visual behavior:**

- CAD-native row shows `C$` primary balance.
- PHP-native rows show `₱` primary balance.
- PHP rows show a smaller secondary `≈ C$` value underneath/right-aligned with the primary amount.
- Editable rows use the existing chevron affordance.
- The Accounts header reports `16 accounts`.

The 2026-09-12 screenshot also captured the reversible production validation while GCash temporarily held a test value. That temporary balance was subsequently restored to the exact original native value. The screenshot is evidence of layout/write-path behavior, not an authoritative current balance reference.

**Preserve:** compact rows, aligned amounts, native-currency-first display, secondary CAD context, and consistent edit affordance.

## UI-08 — Installed Mobile PWA

**Evidence:** current Android standalone PWA screenshot from 2026-09-12.  
**Observed:** portrait layout, phone status bar, persistent bottom navigation, central Add button, no browser address bar, Wealth content scrolling above bottom navigation.  
**Preserve:** safe-area spacing, bottom navigation clearance, central Add button prominence, no clipped account rows, no browser-chrome dependency.

## Unavailable/error visual state

For Philippines accounts, backend identity/formula validation can deliberately return unavailable data.

Expected UI behavior:

- show **Unavailable** instead of a possibly wrong balance;
- for PHP conversion failure, show CAD equivalent unavailable;
- remove the edit affordance when the server marks the account non-editable;
- never synthesize a zero or client-side FX value to hide a failed authoritative read.

## Screenshot capture rules

1. Use the current production PWA and record the date/release SHA when a screenshot becomes authoritative evidence.
2. Prefer approximately 390–430 px mobile widths for primary references.
3. Never show the device key, Script Properties, credentials, private URLs, or developer-console secrets.
4. Do not treat displayed balances as permanent documentation facts; live financial values change.
5. Do not use screenshots to infer formula/editability rules.
6. Replace or supersede a screenshot reference when the production UI materially changes.
7. For write validation screenshots, document that the temporary test value was restored rather than preserving the test amount as a baseline.