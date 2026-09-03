STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Security and Architecture Rules

**Owner:** Glen Reyes  
**Authority:** This is the project's technical constitution. Any conflicting older plan is superseded.  
**Related master:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`

The words **MUST**, **MUST NOT**, **REQUIRED**, and **PROHIBITED** are binding for implementation and review.

## Authentication and secrets

1. The production app MUST remain private and single-owner unless the owner explicitly approves a new security model.
2. Normal runtime MUST use the owner device-key architecture. Google OAuth is not the current runtime architecture.
3. The device-key value is secret. It MUST NOT be requested in chat or placed in source, Git, `config.js`, URLs, query parameters, custom headers, service workers, screenshots, documentation, prompts, logs, test fixtures, analytics, or error reports.
4. The browser may store the key only in the established runtime `localStorage` entry on the owner's device.
5. The server MUST read the expected key from the `PERSONAL_APP_DEVICE_KEY` Apps Script Script Property.
6. Missing, malformed, or invalid keys MUST return a generic unauthorized result without revealing comparison details.
7. Removing a device or receiving an unauthorized result MUST clear local authorization and cached financial state.
8. Spreadsheet IDs, Script Properties, and other server configuration MUST remain server-owned. Do not expose them to the browser unless technically unavoidable and explicitly reviewed.

## Financial transport

9. Every financial read or write MUST use authenticated `POST`.
10. The client MUST send `Content-Type: text/plain;charset=utf-8` and a JSON body containing only `deviceKey`, an allowlisted `action`, and a bounded `payload`.
11. Financial GET APIs are PROHIBITED. At minimum, `GET ?action=getExpenses` and `GET ?action=getWealth` MUST remain denied.
12. POST without a key or with an invalid key MUST remain denied.
13. The action dispatcher MUST use an explicit allowlist and reject unknown actions.
14. Financial data and secrets MUST NOT appear in URLs, redirects, referrers, or service-worker caches.

## Google Sheets boundary

15. Google Sheets remains the authoritative database and calculation engine.
16. The browser MUST NOT calculate or overwrite authoritative Sheet totals after a write.
17. The browser MUST NOT supply Sheet names, spreadsheet IDs, A1 ranges, cell references, row numbers, or formulas to a financial write API.
18. A generic API such as `updateCell(cell, value)` is PROHIBITED.
19. A generic Sheet API such as `updateSheet(sheetName, range, value)` is PROHIBITED.
20. Expense updates and deletes MUST use immutable logical transaction IDs; the server resolves the live row.
21. Wealth writes MUST use stable logical `accountId` values mapped server-side to exact approved cells.
22. Every Wealth write target MUST exist in an explicit server-side whitelist. Absence from the whitelist means read-only.
23. Formula cells MUST be protected. The server MUST inspect the live target for a formula before every write and MUST reject formula targets even if a stale configuration marks them editable.
24. Summary cells are read-only unless a separate approved phase explicitly identifies them as safe source inputs.
25. I21 (`National Bank TFSA-USD`) is formula-driven and MUST NEVER be written directly. In Phase 2C, editing writes manual raw USD to J21 while I21 remains the protected GOOGLEFINANCE formula display cell.
26. I20 and I22 are editable in Phase 2C only with strict summary formula guards verifying J14 (`=I20`) and K14 (`=I22`) remain intact before and inside lock. J14 and K14 MUST NEVER be directly written.
27. Reserve editing is excluded from Phase 2A (released in Phase 2B).

## Financial mutation integrity

28. All financial writes MUST perform server-side validation; browser validation is usability only.
29. Every financial write MUST use `LockService` to serialize the critical section.
30. Formula status and target authorization SHOULD be rechecked after the lock is acquired and before writing.
31. Numeric input MUST be finite and conform to a documented balance policy, including precision and allowed range. Do not silently invent support for negative balances.
32. Expense currency values MUST continue to normalize through integer cents.
33. After a successful Wealth write, the server MUST allow Sheet recalculation, call `getWealth()`, and return the complete fresh Wealth object.
34. Wealth writes MUST NOT use aggressive optimistic UI. The client updates only after server confirmation.
35. Partial or ambiguous write results MUST be treated as failure until an authoritative reread proves the Sheet state.

## Cache safety

36. Service-worker Cache Storage MUST contain only same-origin static shell assets. It MUST NOT intercept cross-origin Apps Script traffic or non-GET requests.
37. Financial API responses MUST NOT be added to service-worker caches.
38. Browser finance snapshots are non-authoritative convenience copies and MUST be visibly distinguishable from live data when refresh fails.
39. Expense server cache MUST remain short-lived and MUST be invalidated after every expense mutation.
40. A successful Wealth write MUST replace the Wealth snapshot with the complete authoritative response, not a patched client object.
41. Device removal MUST clear expense and Wealth snapshots, timestamps, and in-memory finance data.
42. Cached data MUST never contain the device key.

## Source control and production

43. Current production code claims MUST be checked against GitHub `main`, not inferred from older handovers.
44. Application code, Google Sheets, and deployments MUST NOT be changed as part of documentation-only work.
45. Meaningful changes MUST use a focused development branch and reviewable commits.
46. Unrelated refactors, framework migrations, and stable-area redesigns are prohibited during a focused phase.
47. No secret, private financial record, credential file, or clasp credential may be committed.
48. Production MUST NOT be deployed solely because unit tests pass.
49. Financial production writes require explicit owner approval immediately before live-write validation or release.
50. Production Apps Script changes MUST create an immutable version and update the **existing** production Web App deployment so its URL remains stable.
51. Rollback branches and preserved Apps Script versions MUST remain intact. Current protected history includes versions 20, 22, 23, and 28 plus `pre-stage-6-wealth-production`.
52. Git history SHOULD be rolled back with a reviewed revert commit, not destructive force-resetting of shared history.

## Required testing gates

53. Every feature must have local syntax checks and focused automated tests.
54. API tests MUST cover valid action routing, unknown actions, missing key, invalid key, and authenticated success.
55. Security tests MUST prove financial GET denial and absence of device-key material from Git, config, URLs, service worker, logs, screenshots, documentation, and fixtures.
56. Wealth-write tests MUST cover every allowed logical ID, every denied ID, formula rejection, summary-cell rejection, reserve rejection, numeric validation, lock usage, full-object response, and cache replacement.
57. Formula protection MUST be tested against live formula inspection, not only static configuration.
58. UI review MUST cover approximately 390–430 px mobile widths, loading, success, error, saved-data, and read-only states.
59. A test deployment using non-production data MUST pass before production write validation.
60. Production validation MUST be minimal, reversible, explicitly approved, and followed by exact restoration and an authoritative reread.
61. A production smoke test MUST verify both successful owner access and required denial paths.
62. Test counts MUST be reported honestly. The Stage 6 release record is 102/102, but a clean clone currently has one environment-dependent Stage 2 failure until the missing untracked `.clasp.json` dependency is addressed.

## Decision rule

When a proposed shortcut conflicts with any rule above, stop. Produce the smallest compliant design, identify the exact blocker, and request owner approval only when a production write, deployment, security-model change, or meaningful scope expansion is necessary.
