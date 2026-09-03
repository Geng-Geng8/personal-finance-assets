STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Google Sheet Data Model

**Owner:** Glen Reyes  
**Source of Truth:** Read-only inspection of the production spreadsheet `2026 Buckets Budget` on 2026-09-03, reconciled with Apps Script at National Bank Wealth Editing release SHA `b07fd32764e8f75bb3a80a10d07a4e28bf915838` (Apps Script Version 32).
**Related master:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`

This document describes structure and formula relationships. It intentionally excludes live balances, transaction rows, and the private spreadsheet ID.

## Runtime tabs

| Tab | Runtime purpose | Current code access |
| --- | --- | --- |
| `Spending_Master2026` | Transaction database for Expenses and Spending Insights | Read and write |
| `2026-Budgets` | Wealth account inputs, summary values, reserves, and Sheet formulas | Read-only in Stage 6 |

The workbook contains additional historical, monthly, mapping, and net-worth tabs. Current production Apps Script does not directly access them for the PWA. Do not create a separate Wealth database unless a future, evidence-backed requirement justifies it.

## `Spending_Master2026`

Header row is row 1; transactions begin at row 2.

| Column | Header in Sheet | API field | Role | Write rule |
| --- | --- | --- | --- | --- |
| A | `ID` | `id` | Immutable logical record ID | Server-generated; never client row number |
| B | `Date` | `date` | Transaction date | Valid real date, exchanged as `YYYY-MM-DD` |
| C | `Cost` | `cost` | Expense amount | Finite, positive, normalized through integer cents |
| D | `Buckets` | `bucket` | Top-level spending bucket | Backend allowlist |
| E | `Category ` | `category` | Category belonging to bucket | Backend bucket/category validation |
| F | `Item` | `item` | Required description | Trimmed, non-empty |
| G | `Notes` | `notes` | Optional detail | Trimmed string |
| H | `Payment Method` | `paymentMethod` | Payment type | Backend allowlist |

The backend reads A:H in one batch. Add appends one row. Update preserves A and writes B:H. Delete resolves the row from immutable ID at mutation time. All mutations use `LockService`, then invalidate the short-lived server expense cache.

## `2026-Budgets` Wealth summary

Classification terms:

- **MANUAL INPUT:** a user-entered numeric cell, not a formula.
- **FORMULA:** a Sheet-computed cell.
- **SUMMARY:** a top-level value consumed by the Wealth UI.
- **EDITABLE:** approved target for the current write phase.
- **READ ONLY:** never writable through the current phase.

| Cell | Wealth meaning | Sheet entry type at inspection | Role | App editability |
| --- | --- | --- | --- | --- |
| H14 | Available Cash | FORMULA: `I29 − P14 − N14 − O14` | SUMMARY | READ ONLY |
| I14 | Total TFSA | FORMULA referencing L17 | SUMMARY | READ ONLY |
| J14 | Total FHSA | FORMULA: `=I20` | SUMMARY | READ ONLY (formula-linked to I20; never directly editable) |
| K14 | Total RRSP | FORMULA: `=I22` | SUMMARY | READ ONLY (formula-linked to I22; never directly editable) |
| L14 | Total Crypto | MANUAL INPUT | SUMMARY | READ ONLY |
| M14 | Total Invested | FORMULA: sum of I14:K14 | SUMMARY | READ ONLY |
| N14 | Tax Reserve | FORMULA: `sum of N2:N13` | SUMMARY | READ ONLY (formula-protected; fed by N2:N13, active September 2026 input cell is N10) |
| O14 | Income Tax / CPP Reserve | FORMULA: `sum of O2:O13` | SUMMARY | READ ONLY (formula-protected; fed by O2:O13, active September 2026 input cell is O10) |
| P14 | Emergency Fund | MANUAL INPUT | SUMMARY / RESERVE | EDITABLE (replace only via `emergency_fund`) |
| I29 | Total Cash | FORMULA: `=SUM(I23:I28)+I30+I31+I32` | SUMMARY | READ ONLY (I30:I32 are included in the Sheet formula but not in the app whitelist) |

`M14` excludes Crypto by design because it sums registered investment totals I14:K14. Crypto is read separately from L14 and displayed separately in the UI.

## Individual account area: H17:J28

The exact Sheet labels differ slightly from the normalized product names. The stable IDs below define the **current Wealth account editing contract**, expanding the original nine Phase 2A accounts into the current twelve-account production model with explicit stable logical IDs, live formula inspection, and editability metadata.

| Cell | Exact Sheet label | Product display name | Stable logical ID | Cell type | Production status |
| --- | --- | --- | --- | --- | --- |
| I17 | `EQ-TFSA` | EQ-TFSA | `eq_tfsa` | MANUAL INPUT (CAD) | EDITABLE |
| I18 | `WEALTHSIMPLE- TFSA` | WEALTHSIMPLE-TFSA | `wealthsimple_tfsa` | MANUAL INPUT (CAD) | EDITABLE |
| I19 | `National Bank TFSA` | National Bank TFSA | `national_bank_tfsa` | MANUAL INPUT (CAD) | EDITABLE |
| I20 | `National Bank FHSA ` | National Bank FHSA | `national_bank_fhsa` | MANUAL INPUT (CAD) | EDITABLE (writes I20 only; J14 formula guard `=I20`) |
| I21 | `National Bank TFSA-USD` | National Bank TFSA-USD | `national_bank_tfsa_usd` | FORMULA: `=J21*GOOGLEFINANCE("CURRENCY:USDCAD")` | DISPLAY ONLY (CAD output; edits raw USD in J21) |
| I22 | `National Bank RRSP` | National Bank RRSP | `national_bank_rrsp` | MANUAL INPUT (CAD) | EDITABLE (writes I22 only; K14 formula guard `=I22`) |
| I23 | `Simplii - Che` | Simplii Chequing | `simplii_chequing` | MANUAL INPUT (CAD) | EDITABLE |
| I24 | `Simplii - Sav` | Simplii Savings | `simplii_savings` | MANUAL INPUT (CAD) | EDITABLE |
| I25 | `EQ - Sav` | EQ Savings | `eq_savings` | MANUAL INPUT (CAD) | EDITABLE |
| I26 | `EQ Bank Card` | EQ Bank Card | `eq_bank_card` | MANUAL INPUT (CAD) | EDITABLE |
| I27 | `EQ - Geng-Cash` | EQ Geng-Cash | `eq_geng_cash` | MANUAL INPUT (CAD) | EDITABLE |
| I28 | `TD - Sav` | TD Savings | `td_savings` | MANUAL INPUT (CAD) | EDITABLE |

Authoritative whitelist size: **twelve editable accounts** (nine Phase 2A standard CAD accounts, two summary-guarded CAD accounts for FHSA and RRSP, and one split input/output USD account for TFSA-USD). I21 is formula-driven and must never be written directly by the app. J21 is the manual raw USD input cell edited by `national_bank_tfsa_usd`.

## Verified formula dependencies

```mermaid
flowchart TD
    J21["J21 raw USD"] -->|"GOOGLEFINANCE(CURRENCY:USDCAD)"| I21["I21 TFSA-USD (CAD)"]
    TFSA["I17:I19 + I21"] --> L17["L17 TFSA total"]
    L17 --> I14["I14 Total TFSA"]
    I20["I20 National Bank FHSA"] --> J14["J14 Total FHSA (=I20)"]
    I22["I22 National Bank RRSP"] --> K14["K14 Total RRSP (=I22)"]
    I14 --> M14["M14 Total Invested"]
    J14 --> M14
    K14 --> M14
    CASH["I23:I28 + I30:I32 cash cells"] --> I29["I29 Total Cash (=SUM(I23:I28)+I30+I31+I32)"]
    N["N2:N13 tax inputs"] --> N14["N14 Tax Reserve"]
    O["O2:O13 income tax/CPP inputs"] --> O14["O14 Income Tax/CPP"]
    I29 --> H14["H14 Available Cash"]
    N14 --> H14
    O14 --> H14
```

P14 Emergency Fund also feeds H14 directly. `M14` is calculated from I14:K14.

## Known dependency gaps

- Historically, J14 and K14 were manual summaries and I21 used an embedded constant. In the current release, all three are formula-resolved: J14 is formula-linked to I20 (`=I20`), K14 is formula-linked to I22 (`=I22`), and I21 is formula-driven by `=J21*GOOGLEFINANCE("CURRENCY:USDCAD")`.
- L14 Crypto is a user-entered summary outside the H17:J28 account area; it remains read-only.
- I30:I32 are included in the production I29 Total Cash formula (`=SUM(I23:I28)+I30+I31+I32`), but are not currently part of the app account whitelist.
- P14 Emergency Fund is an editable manual input cell in Phase 2B (direct balance replacement only).

## Wealth account editing server mapping

The browser sends only:

```json
{
  "accountId": "national_bank_fhsa",
  "balance": 35000.00
}
```

The server owns the map from `accountId` to the exact approved cell. It must never accept a Sheet name, spreadsheet ID, A1 range, row number, cell address, formula, or FX rate from the browser.

For standard CAD accounts (the 9 Phase 2A accounts plus FHSA and RRSP):
- Write cell is the account's balance cell (`I17`–`I20`, `I22`–`I28`).
- For FHSA and RRSP, the server verifies required summary formula guards before writing (`J14 = '=I20'`, `K14 = '=I22'`).

For split USD/CAD account (`national_bank_tfsa_usd`):
- `writeCell` is `J21` (raw USD manual input).
- `displayBalanceCell` is `I21` (formula-driven CAD display value via GOOGLEFINANCE).
- `editCurrency` is `"USD"`; the editor labels the input `USD Balance`.
- `I21` is formula-protected and never directly writable.

Before every account write, the server must:

1. Authenticate the POST device key.
2. Reject unknown or non-editable account IDs.
3. Resolve the exact source cell and required formula guard from the server-side whitelist.
4. If a formula guard is defined, verify the live cell contains the exact approved formula (whitespace/case-normalized).
5. Inspect the live write cell and reject the write if it contains a formula.
6. Validate the numeric balance (finite number, max 2 decimal places, 0.00–1,000,000,000.00).
7. Acquire `LockService`.
8. Recheck the target write cell and formula guards inside the critical section.
9. Write only the approved single write cell.
10. Flush Sheet recalculations.
11. Call `getWealth()` and return the complete fresh authoritative Wealth object.

The client must replace its Wealth state and cache only with that returned object. No optimistic Wealth state mutation occurs.

## Phase 2B reserve management mapping

The browser sends:

```json
{
  "reserveId": "tax_reserve_2026_09",
  "operation": "add",
  "amount": 150.00
}
```

Authoritative server-side reserve targets:

| Stable logical ID | Exact Sheet cell | Reserve type | Approved operations | Write rule |
| --- | --- | --- | --- | --- |
| `tax_reserve_2026_09` | N10 | Tax Reserve (September 2026) | `add`, `pay`, `replace` | Manual input; cannot make total negative |
| `income_tax_cpp_reserve_2026_09` | O10 | Income Tax / CPP (September 2026) | `add`, `pay`, `replace` | Manual input; cannot make total negative |
| `emergency_fund` | P14 | Emergency Fund | `replace` only | Manual input; cannot be negative |

Strictly protected formula/read-only cells:
- `N14`: `=SUM(N2:N13)` (Tax Reserve summary; never writable)
- `O14`: `=SUM(O2:O13)` (Income Tax / CPP summary; never writable)
- `H14`: `=I29-P14-N14-O14` (Available Cash summary; never writable)

Before every reserve write, the server must:

1. Authenticate the POST device key.
2. Reject unknown or non-editable reserve IDs.
3. Verify the operation is permitted for the target reserve (`replace` only for `emergency_fund`; `add`/`pay`/`replace` for tax reserves).
4. Validate numeric input (finite, positive for add/pay, maximum two decimal places).
5. Resolve the target cell from the server-side whitelist (`N10`, `O10`, `P14`).
6. Inspect the live target cell and reject if it contains a formula.
7. Inspect dependent formula cells (`N14`, `O14`, `H14`) and reject if any formula is altered or missing.
8. Enforce the non-negative policy: the operation must not cause the projected authoritative reserve total to drop below zero.
9. Acquire `LockService.getScriptLock(10000)`.
10. Recheck the target formula state inside the lock.
11. Write the single approved cell.
12. Flush and let the Sheet recalculate.
13. Call `getWealth()` and return the complete authoritative fresh Wealth object.

Known intentional limitation: Reserve source editing is hard-coded to September 2026 (`N10` / `O10`) in this release. Current-month rollover and dynamic month targeting are deferred to the next phase.

## Time-zone note

The production spreadsheet reports `America/New_York`; `apps-script/appsscript.json` reports `America/Toronto`. The current backend formats expense dates using the spreadsheet time zone. This discrepancy is documented, not resolved. Audit both settings before any date/time behavior change.
