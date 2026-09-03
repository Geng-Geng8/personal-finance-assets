STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Roadmap and Current Phase

**Owner:** Glen Reyes  
**Source of Truth:** Current production baseline and approved phase definition.  
**Related:** `03_Google_Sheet_Data_Model.md`, `04_Security_and_Architecture_Rules.md`, `07_Release_and_Testing_Playbook.md`

## Current baseline

National Bank Wealth Editing is in production at application release commit `b07fd32764e8f75bb3a80a10d07a4e28bf915838` (on `main`; docs commits advance `main` without altering application code) and Apps Script Version 32. The release record is 194/194 automated tests passed (expanding coverage from Phase 2B's 166/166 baseline, Phase 2A's 141/141 baseline, and Stage 6's historical 102/102 baseline).

## Phase 2A: editable approved manual Wealth accounts (COMPLETE / PRODUCTION)

**Goal**  
Allow the owner to update approved individual account balances from the Wealth screen while Google Sheets remains authoritative and recalculates every dependent total.

**Status**  
COMPLETE / PRODUCTION. Released to production with Apps Script Version 30 and Phase 2A application release commit `ba6a252e96d4aa779c381c082f211e1851c45d6f`. Exactly nine approved manual accounts are editable. Non-production integration gate passed; reversible production write passed, exact original balance restored, and dependent totals returned to baseline.

**Production API contract**

- Action: `updateWealthAccountBalance`
- Client payload: `{ accountId, balance }`
- Server response after success: `{ ok: true, wealth: <complete fresh Wealth object> }`
- Server resolves `accountId` to one exact approved cell from the nine-account allowlist.

**Scope**

- Add explicit stable logical IDs and editability metadata for Wealth accounts.
- Initially permit only the nine approved cells: I17:I19 and I23:I28.
- Add a small mobile balance editor for server-approved accounts.
- Authenticate by device-key POST.
- Validate `accountId` and balance server-side.
- Inspect formula state before every write.
- Use `LockService` and recheck inside the critical section.
- Write one approved manual cell.
- Reread `getWealth()` and return the full object.
- Replace frontend Wealth state and cache only after success.
- Add focused automated, UI, security, test-deployment, and reversible production validation.

**Not in scope for initial Phase 2A (historical note: resolved in Phase 2B and 2C)**

- I20 National Bank FHSA (released in Phase 2C with J14 formula `=I20`).
- I22 National Bank RRSP (released in Phase 2C with K14 formula `=I22`).
- I21 National Bank TFSA-USD (released in Phase 2C with J21 raw USD input and I21 GOOGLEFINANCE conversion).
- Tax Reserve, Income Tax / CPP Reserve, or Emergency Fund editing (released in Phase 2B).
- Crypto editing.
- Account creation, deletion, renaming, or reordering.
- Arbitrary Sheet/cell APIs.
- Frontend total calculations.
- Navigation or stable-screen redesign.
- OAuth, framework, hosting, or database migration.

**Prerequisites**

1. Treat the stable ID/cell table in `03_Google_Sheet_Data_Model.md` as the implementation contract.
2. Decide and document the accepted balance range and precision; do not silently invent negative-balance support.
3. Design formula inspection compatible with Apps Script and test doubles.
4. Add a test Sheet/deployment whose formula relationships match the production cells without using real financial data.
5. Fix or explicitly isolate the clean-clone Stage 2 `.clasp.json` test dependency before claiming the full suite is reproducible.
6. Keep I20 and I22 read-only unless their summary relationships are separately approved and verified.

**Risks**

- A stale or incorrect whitelist could target the wrong cell.
- A cell may be converted to a formula after configuration is written.
- FHSA/RRSP summary cards can become stale if I20/I22 are enabled prematurely.
- Optimistic UI could display a balance that the Sheet rejected.
- Concurrent writes could race without locking.
- Cached Wealth data could conceal a failed refresh.
- A deployment could pass unit tests while pointing at the wrong Apps Script version or endpoint.

**Success criteria**

1. Only the nine initial logical IDs can write.
2. Unknown, formula, summary, reserve, and dependency-blocked targets are rejected.
3. No browser request contains a Sheet name, spreadsheet ID, A1 range, row, cell, or formula.
4. Formula inspection and `LockService` run for each write.
5. A successful response contains the complete recalculated Wealth object.
6. The UI and cache update only from that response.
7. Errors leave the prior confirmed value visible with an honest sync/error state.
8. All required local and test-deployment checks pass.
9. Mobile editor behavior passes review at approximately 390–430 px.
10. A minimal production write is explicitly approved, reversible, restored exactly, and verified by authoritative reread.

## Phase 2B: reserve management (COMPLETE / PRODUCTION)

**Goal**  
Allow deliberate updates to protected reserves without bypassing their existing formulas or making protected money appear spendable.

**Status**  
COMPLETE / PRODUCTION. Released to production with Apps Script Version 31 and Phase 2B application release commit `4679eb5f837ed0eda4777716bf99a385967cc138`. Approved reserve targets are editable with strict formula protection. Automated test record: 166/166 passed. Reversible production write passed on September Tax Reserve (N10) with $0.01 addition, recalculation of N14 and H14 verified, exact restoration confirmed, and baseline preserved.

**Production API contract**

- Action: `updateWealthReserve`
- Client payload: `{ reserveId, operation, amount }`
- Server response after success: `{ ok: true, wealth: <complete fresh Wealth object> }`
- Whitelisted server targets:
  - `tax_reserve_2026_09` -> N10 (September 2026 Tax Reserve input)
  - `income_tax_cpp_reserve_2026_09` -> O10 (September 2026 Income Tax / CPP Reserve input)
  - `emergency_fund` -> P14 (Emergency Fund direct balance input)
- Operation semantics:
  - Tax Reserve and Income Tax / CPP Reserve support `add` (Add Set-Aside), `pay` (Pay CRA), and `replace` (Correct September Total).
  - Emergency Fund supports `replace` only (Set Emergency Fund Balance); `add` and `pay` are rejected.
- Protection and validation:
  - N14 (`SUM(N2:N13)`), O14 (`SUM(O2:O13)`), and H14 (`I29-P14-N14-O14`) are formula-driven and remain strictly read-only.
  - Projected Tax and Income Tax / CPP reserve totals cannot drop below zero.
  - Target cell must be verified non-formula before and inside `LockService.getScriptLock(10000)`.
  - Dependent formulas must remain valid; success returns a full authoritative reread via `getWealth()`.
- Known intentional limitation: Reserve source editing is hard-coded to September 2026 (`N10` / `O10`) for this release.

## Phase 2C: National Bank Wealth Editing (COMPLETE / PRODUCTION)

**Goal**
Enable safe editing for National Bank FHSA (I20), National Bank RRSP (I22), and National Bank TFSA-USD (J21 raw USD input with automatic CAD conversion via GOOGLEFINANCE).

**Status**
COMPLETE / PRODUCTION. Released to production with Apps Script Version 32 and application release commit `b07fd32764e8f75bb3a80a10d07a4e28bf915838`. Authoritative whitelist expanded to twelve accounts. 194/194 automated tests passed. Three minimal reversible production writes passed (+0.01 FHSA, +0.01 RRSP, +0.01 USD TFSA-USD), all dependent recalculations verified, exact original source values restored, Available Cash unaffected, and no synthetic values remaining.

**Production API contract**
- Action: `updateWealthAccountBalance`
- Client payload: `{ accountId, balance }`
- National Bank FHSA: writes I20 only; J14 formula guard `=I20` enforced before and inside lock.
- National Bank RRSP: writes I22 only; K14 formula guard `=I22` enforced before and inside lock.
- National Bank TFSA-USD: writes J21 raw USD only; I21 formula guard `=J21*GOOGLEFINANCE("CURRENCY:USDCAD")` enforced before and inside lock; I21 never directly writable; frontend displays CAD from I21 and edits USD via J21 with `editCurrency = USD`.

## NEXT — Current-month reserve rollover / month targeting (NEXT PRODUCT PHASE)

**Goal**
Allow reserve operations to target the current active calendar month dynamically or roll over across month boundaries rather than remaining hard-coded to September 2026 (`N10` / `O10`).

**Status**
Planned next product phase. The solution is not yet defined or implemented.

**Scope**
- Evaluate dynamic current-month resolution versus explicit month selection in the UI.
- Determine rollover and reconciliation semantics across calendar month transitions.
- Preserve all existing Phase 2B security guarantees: authenticated POST, server-owned targets, formula protection for N14/O14/H14, zero-floor constraints, LockService, and authoritative `getWealth()` rereads.
- Maintain backwards compatibility and non-destructive Sheet operations.

## LATER — no committed feature roadmap

No feature beyond current-month reserve rollover / month targeting is currently committed by an authoritative source. Bank synchronization, multi-user access, a fourth navigation tab, a separate Wealth database, paid infrastructure, and major redesigns are not roadmap commitments. Add a later feature only when the owner approves a concrete goal, scope, prerequisites, risks, and success criteria based on current evidence.

## Best next step

Design the current-month reserve rollover / month targeting approach in an architecture brief before making any code changes.
