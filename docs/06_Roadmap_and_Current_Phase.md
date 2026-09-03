STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Roadmap and Current Phase

**Owner:** Glen Reyes  
**Source of Truth:** Current production baseline and approved phase definition.  
**Related:** `03_Google_Sheet_Data_Model.md`, `04_Security_and_Architecture_Rules.md`, `07_Release_and_Testing_Playbook.md`

## Current baseline

Phase 2A Wealth Account Editing is in production at application release commit `ba6a252e96d4aa779c381c082f211e1851c45d6f` (on `main`; docs commits advance `main` without altering application code) and Apps Script Version 30. The release record is 141/141 automated tests passed (restoring and expanding coverage from Stage 6's historical 102/102 baseline).

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

**Not in scope**

- I20 National Bank FHSA until J14 dependency is resolved.
- I22 National Bank RRSP until K14 dependency is resolved.
- I21 National Bank TFSA-USD, which is formula-driven.
- Tax Reserve, Income Tax / CPP Reserve, or Emergency Fund editing.
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

## NOW — Phase 2B: reserve editing after source audit (ACTIVE NEXT PHASE)

**Goal**  
Allow deliberate updates to protected reserves without bypassing their existing formulas or making protected money appear spendable.

**Status**  
Active next phase. No reserve write contract is yet approved. A read-only source audit is required first.

**Scope**

- Audit N2:N13, O2:O13, P14, labels, monthly semantics, and dependent formulas.
- Decide whether the user edits source-period inputs or a single approved reserve input.
- Define stable logical IDs and server-side mappings only after the audit.
- Preserve H14 Available Cash formula behavior.
- Add clear reserve-specific UX and the same authenticated, locked, full-reread write pattern.

**Not in scope**

- Editing formula summary cells N14 or O14 directly.
- Combining protected reserves with spendable cash.
- Reusing a generic Phase 2A account ID for reserve writes.
- Any write implementation before the source audit and owner approval.

**Prerequisites**

1. Read-only source audit of all reserve inputs and formulas.
2. Confirm the intended monthly/annual workflow and whether P14 is a direct source or derived value.
3. Define exact edit targets, validation, and dependency tests.
4. Completed and stabilized Phase 2A (application release commit `ba6a252e96d4aa779c381c082f211e1851c45d6f` / Version 30).

**Risks**

- Double-counting or overwriting formula-driven reserves.
- Reducing protected funds accidentally.
- Breaking Available Cash.
- Presenting reserve money as discretionary.

**Success criteria**

1. Every reserve write target is a confirmed manual input with a stable server ID.
2. Formula and summary cells remain protected.
3. Available Cash and reserve totals recalculate correctly in the Sheet.
4. UI hierarchy keeps protected money visually distinct.
5. The complete release and rollback playbook passes.

## LATER — no committed feature roadmap

No feature after Phase 2B is currently committed by an authoritative source. Bank synchronization, multi-user access, a fourth navigation tab, a separate Wealth database, paid infrastructure, and major redesigns are not roadmap commitments. Add a later feature only when the owner approves a concrete goal, scope, prerequisites, risks, and success criteria based on current evidence.

## Best next step

Perform the Phase 2B read-only source audit of all reserve inputs, formulas, and monthly semantics (N2:N13, O2:O13, P14). Do not write to production reserve cells.
