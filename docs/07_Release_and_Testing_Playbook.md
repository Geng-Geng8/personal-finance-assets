STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Release and Testing Playbook

**Owner:** Glen Reyes  
**Source of Truth:** Current production workflow and security constitution.  
**Related:** `04_Security_and_Architecture_Rules.md`

## Current release baseline

| Item | Baseline |
| --- | --- |
| Phase 2B application release SHA | `4679eb5f837ed0eda4777716bf99a385967cc138` (docs commits may advance `main` without changing deployed application code) |
| Production Apps Script | Version 31 — Phase 2B Reserve Management Production Candidate |
| Production Web App | Existing deployment `AKfycbxoRJ6dv8RdrZNtR_IjGkgCc_J6sbLyffsxt9xEiYJLjDGeWsJ0o73HYLcjTnJX3ajQ` |
| Phase 2B release result | 166 / 166 automated tests passed (including 25 dedicated Stage 8 reserve-management tests) |
| Pre-Phase-2B rollback | Version 30 (`Phase 2A Wealth Account Editing Production Candidate`) / commit `5513e933733ed5930de3e21bbd6ae2aa5e227ef5` |
| Preserved Apps Script versions | 20, 22, 23, 28 (prior Stage 6 rollback), 30 (prior Phase 2A rollback), 31 |
| Historical Phase 2A baseline | 141 / 141 automated tests passed (`ba6a252e96d4aa779c381c082f211e1851c45d6f` / Version 30) |
| Historical Stage 6 baseline | 102 / 102 automated tests passed (`pre-stage-6-wealth-production` at `6c57290f3496cc44d06febc3284ee94e3259958f` / Version 28) |

Phase 2B validation status:
- Local tests: 166/166 passed (`npm run check` and `npm test`).
- Test deployment gate: passed on synthetic spreadsheet and dedicated test Apps Script deployment (reserve add/pay/replace tested, formula overwrite protection verified, LockService verified, test project purged).
- Production verification: denial checks passed on production URL; reversible production Tax Reserve live write passed on September Tax Reserve (N10) with $0.01 addition, recalculation of N14 and H14 verified, exact restoration confirmed, baseline preserved, and zero synthetic residue remains.

## Environment distinctions

| Tier | Purpose | Data | What it proves |
| --- | --- | --- | --- |
| Local tests | Fast deterministic logic, syntax, contracts, negative paths | Mocks and synthetic fixtures only | Code behavior without a live Google deployment |
| Test deployment | Integration with Apps Script, locks, formulas, transport, and a non-production Sheet | Synthetic data only | Real Google behavior without production risk |
| Production verification | Endpoint/version correctness and minimal real-environment confidence | Existing production data plus one explicitly approved reversible validation | The released system works at the real URL and Sheet |

Passing one tier does not replace the next tier. Unit tests do not authorize a deployment or production write.

## Standard branch workflow

1. Fetch and inspect current `main`; record its full SHA.
2. Confirm production PWA, Apps Script version/deployment, and rollback state.
3. Create one focused branch, for example `phase-2a-editable-wealth-accounts`.
4. Change only phase-relevant files. Preserve unrelated user work.
5. Use small, logical commits with security-impacting changes clearly named.
6. Review the final diff against the recorded base SHA.
7. Do not merge until all gates below pass and the owner gives explicit approval.

## Phase 2A local test sequence

Run from a clean working tree or explicitly account for unrelated changes:

1. JavaScript and Apps Script syntax checks.
2. Existing full test suite.
3. Focused Wealth read tests.
4. New write-contract unit tests.
5. Security scan.
6. `git diff --check`.
7. Review `git diff --stat`, changed filenames, and the full patch.

Required new test cases:

- `updateWealthAccountBalance` is allowlisted only through authenticated POST.
- Missing and invalid device keys are denied.
- Financial GET remains denied.
- Each of the nine initial approved IDs maps to exactly one expected cell.
- Unknown IDs are denied.
- I20 and I22 are denied initially.
- I21 and any live formula cell are denied.
- Summary and reserve cells cannot be targeted.
- Payloads containing Sheet names, ranges, rows, cells, or spreadsheet IDs have no effect.
- Balance validation rejects non-numeric, non-finite, excessive-precision, and out-of-policy values.
- Lock acquisition/release and inside-lock formula recheck occur.
- Successful write returns a complete fresh Wealth object.
- Failed write does not update the frontend cache.
- Successful response replaces the Wealth cache.
- Remove This Device still clears key plus expense and Wealth caches.
- Existing expense CRUD, insights, PWA, and Stage 6 read behavior do not regress.

## Test-deployment sequence

1. Use a dedicated non-production Sheet containing the same relevant cells and formulas, populated only with synthetic values.
2. Use a dedicated Apps Script test deployment and non-production Script Properties.
3. Verify the configured spreadsheet is the test spreadsheet before any write.
4. Test all nine approved IDs.
5. Convert one test target temporarily to a formula and prove the server refuses to overwrite it.
6. Test concurrent or near-concurrent requests and verify locking behavior.
7. Verify the returned full Wealth object matches the recalculated test Sheet.
8. Restore the test Sheet and confirm no synthetic residue matters to production.

Never substitute the production spreadsheet or deployment for this tier.

## Browser and UI review

Review at approximately 390 px and 430 px widths, plus a desktop sanity check:

- Expenses startup, summary, list, search, filters, add, edit, and delete.
- Spending Insights segmented state and charts.
- Wealth hero, cash/reserves equation, investments, Crypto, accordion collapsed/expanded.
- Approved accounts visibly editable; formula and blocked accounts visibly read-only.
- Balance editor focus, keyboard, formatting, validation, cancel, submit, loading, success, and error.
- No horizontal overflow, clipped controls, or bottom-nav collisions.
- Saved-data versus live status is honest.
- Installed PWA safe areas and relaunch behavior.
- Remove This Device confirmation and post-removal state.

Do not use real device-key values in screenshots or test evidence.

## Security review gate

Before production approval, verify:

1. Device key absent from Git, config, URLs, logs, service worker, screenshots, prompts, docs, and fixtures.
2. `GET ?action=getExpenses` and `GET ?action=getWealth` are denied.
3. POST missing/invalid key is denied.
4. Unknown action and unknown `accountId` are denied.
5. Browser cannot specify spreadsheet, tab, range, cell, row, or formula.
6. Server whitelist contains only the approved logical IDs.
7. Formula inspection protects the live target on every write.
8. `LockService` wraps the critical section.
9. Full Sheet reread supplies the success response.
10. Service worker does not cache API traffic; local financial caches clear correctly.

## Release sequence

1. **Checkpoint:** Present implementation diff, test evidence, UI evidence, security review, and remaining risks to the owner.
2. **Explicit approval:** Obtain approval to prepare production. This does not yet authorize a live financial write unless stated.
3. **Rollback branch:** Create an immutable pre-release branch at the exact current production main SHA, for example `pre-phase-2a-wealth-edit-production`.
4. **Apps Script version:** Create a new immutable Apps Script version using the next actual available number; do not guess the number in advance.
5. **Deployment:** Update the existing production Web App deployment to that version. Do not create a second production URL.
6. **Backend read verification:** Confirm authenticated read behavior and required denial paths before any production write.
7. **Live-write approval:** Obtain explicit owner approval immediately before the reversible production write.
8. **Reversible validation:** Use one approved manual account. Record its exact authoritative original value privately, write a controlled valid test value, verify the account and all dependent totals, restore the exact original value immediately, and reread until the original state is confirmed. Do not use a formula, blocked, summary, or reserve cell.
9. **Frontend merge:** Merge through a reviewed change into `main` only after backend validation succeeds.
10. **GitHub Pages verification:** Confirm the deployed page corresponds to the approved SHA and loads its current assets.
11. **Production smoke test:** Verify Expenses, Spending Insights, Wealth read, one approved account editor path, cache refresh, device removal flow, and denial tests without additional writes.
12. **Close release:** Record main SHA, Apps Script version, deployment ID, tests, production checks, and rollback points in the handover/decision log.

## Production smoke-test matrix

| Check | Expected |
| --- | --- |
| PWA URL loads | Current shell and assets load |
| Owner device setup | Key remains local and masked; no value captured in evidence |
| Expenses read | Authenticated POST succeeds |
| Wealth read | Authenticated POST returns complete object |
| Financial GET | Denied |
| Missing/invalid key POST | Denied |
| Unknown account ID | Denied |
| Formula/blocked account | Read-only and server rejects forced request |
| Approved account edit | Server-confirmed response refreshes full Wealth state |
| Reload/offline shell | Static shell works; saved data is labeled; no API response in Cache Storage |

## Rollback procedure

1. Stop further production writes and capture the failing symptom without secrets.
2. Determine whether the fault is frontend, backend, data, or deployment configuration.
3. If a test write is incomplete, perform an authoritative read before any corrective write. Restore only a known original value with explicit approval.
4. For backend rollback, edit the **existing** Web App deployment to the last verified immutable version. For Phase 2B rollback, select Version 30 (Phase 2A Wealth Account Editing Production Candidate). For Phase 2A rollback, select Version 28 (Stage 6 Wealth Read-Only Production). For Stage 6 rollback, select Version 23.
5. For frontend rollback, revert or reset to `5513e933733ed5930de3e21bbd6ae2aa5e227ef5` (pre-Phase-2B base), `ba6a252e96d4aa779c381c082f211e1851c45d6f` (Phase 2A application release SHA), or `pre-phase-2a-wealth-edit-production` (`9cb076cc2bcf62f7b5c29d225bb9da1638939b30`). Avoid force-resetting shared history on main; prefer a reviewed revert commit.
6. Verify the deployed GitHub Pages SHA and clear only appropriate static caches if needed; do not delete user finance data blindly.
7. Run authenticated reads and all denial-path security checks.
8. Confirm expense and Wealth data against the Sheet.
9. Record the incident, rollback version/SHA, validation evidence, and any follow-up test required.

Versions 20 and 22 remain preserved historical checkpoints but are not automatic rollback targets because they may contain superseded authentication architecture. Version 28 remains the active Stage 6 rollback version, and Version 30 remains the active Phase 2A rollback version.
