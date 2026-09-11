STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-12

# Personal Finance PWA — Roadmap and Current Phase

**Owner:** Glen Reyes  
**Source of Truth:** Current production baseline plus owner-approved priorities.  
**Related:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`, `03_Google_Sheet_Data_Model.md`, `04_Security_and_Architecture_Rules.md`

## Current production baseline

| Item | Current state |
| --- | --- |
| Production application SHA | `ca8f973226b2c0fa301326789c865d848006aa1f` |
| Production Apps Script | Version 37 |
| Current release | Philippines Wealth accounts with protected native-balance editing |
| Full regression record | 261 / 261 passed |
| Production validation | Reversible live PHP-account write passed; exact native source restored |
| Synthetic production residue | None |

The current app supports:

- Expense CRUD.
- Spending search, filters, summaries, and charts.
- Wealth Available Cash and protected-reserve decision support.
- Approved Canadian account editing.
- National Bank FHSA/RRSP/TFSA-USD editing.
- Protected reserve management.
- Philippines-held CAD/PHP accounts with Sheet-driven PHP→CAD conversion.

## Completed production phases

### Wealth read-only foundation — COMPLETE

Established the Wealth screen, Sheet-driven summaries, account mapping, cache behavior, and production read path before enabling writes.

### Approved Canadian account editing — COMPLETE

Added stable logical IDs, server whitelist, formula protection, LockService, conservative server-confirmed UI updates, and reversible production validation.

### Reserve management — COMPLETE

Added controlled reserve operations for Tax Reserve, Income Tax / CPP Reserve, and Emergency Fund while protecting summary formulas.

### National Bank FHSA / RRSP / TFSA-USD — COMPLETE

Added safe editing for FHSA and RRSP plus split USD-input/CAD-display handling for TFSA-USD using Sheet GOOGLEFINANCE conversion.

### Philippines Wealth accounts — COMPLETE / PRODUCTION

Added a third Accounts subgroup, **PHILIPPINES**, with:

- Cash — CAD;
- Cash — PHP;
- GoTyme;
- GCash.

PHP balances remain native inputs in Column I. CAD equivalents are formula-driven in Column J. The frontend does not calculate FX.

The release also added fail-closed identity protection: if a row label no longer matches its expected logical account, the backend does not expose that row's money under the wrong account name.

Production validation passed and the original live value was restored exactly.

## Current phase

**Steady-state / no active implementation phase.**

The app currently covers the owner's core day-to-day finance workflow. Do not start another engineering phase merely because a possible enhancement exists.

## Next intentional maintenance milestone

### 2027 Sheet preparation — expected before the 2027 budget year

Prepare the next annual budget Sheet deliberately rather than changing the 2026 production model mid-year without need.

Expected work when this phase is started:

- inspect which 2026 structures should carry forward;
- create/prepare the 2027 budget Sheet;
- preserve formula protections and server-owned mappings;
- decide whether IDs can remain stable across the annual Sheet transition;
- validate any deployment/config change needed to point the backend at the new annual model;
- perform only the minimum reversible production validation required for the changed boundary.

Do not begin this phase until the owner is ready to prepare 2027.

## Optional backlog

### Dynamic reserve month targeting

Current Tax Reserve and Income Tax / CPP Reserve editing still targets September 2026 source cells. A future change could resolve the active month dynamically or allow explicit month selection.

This is **not an active commitment**. Build it only if the owner has a real need before the 2027 Sheet transition.

If pursued, preserve:

- authenticated POST;
- server-owned targets;
- formula protection for N14/O14/H14;
- non-negative reserve constraints;
- LockService;
- authoritative `getWealth()` rereads.

## Later / not committed

The following are not roadmap commitments unless the owner explicitly approves a concrete need:

- bank synchronization;
- multi-user access;
- a fourth navigation tab;
- a separate Wealth database;
- paid hosting/database infrastructure;
- brokerage/trading features;
- broad visual redesign;
- generic spreadsheet editing.

## Best next step

Use the current app. Fix only real bugs or usability problems as they appear. Otherwise, leave production stable until the owner is ready for 2027 Sheet preparation.