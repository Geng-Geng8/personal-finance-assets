STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-12

# Personal Finance PWA — Security and Architecture Rules

**Owner:** Glen Reyes  
**Authority:** This is the project's technical constitution. Conflicting older plans are superseded.  
**Related master:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`

## Core architecture

1. The production stack remains GitHub Pages PWA → authenticated Google Apps Script Web App → Google Sheets.
2. Google Sheets remains the authoritative database and calculation engine.
3. Do not duplicate authoritative Sheet calculations in frontend JavaScript.
4. Do not replace the working architecture without a proven requirement.
5. The app remains private and single-owner unless the owner explicitly approves a new security model.

## Authentication and secrets

6. Normal runtime uses the established owner device-key architecture; historical OAuth work is not current runtime.
7. The device key is secret and MUST NOT be requested, echoed, logged, committed, placed in URLs, query strings, source, config, screenshots, prompts, service workers, fixtures, analytics, or documentation.
8. The browser may store the key only in the established runtime local storage entry on the owner's device.
9. Apps Script validates the key against the server-side Script Property on every financial POST.
10. Missing or invalid keys return a generic unauthorized result.
11. Removing the device or receiving an unauthorized result must clear local authorization and financial snapshots.
12. Spreadsheet IDs, Script Properties, and other server configuration remain server-owned.

## Financial transport

13. Every financial read and write uses authenticated POST.
14. Financial GET APIs remain prohibited.
15. The action dispatcher uses an explicit allowlist and rejects unknown actions.
16. Financial data and secrets must not appear in URLs, referrers, service-worker caches, or client logs.

## Google Sheets boundary

17. The browser MUST NOT supply Sheet names, spreadsheet IDs, A1 ranges, rows, cells, formulas, or FX rates to a financial write API.
18. Generic `updateCell`, `updateRange`, or arbitrary-Sheet APIs are prohibited.
19. Expense mutation uses immutable logical transaction IDs; the server resolves the live row.
20. Wealth mutation uses stable logical IDs mapped server-side to exact approved cells.
21. Absence from a server whitelist means read-only.
22. Numeric cells are not assumed editable merely because they contain numbers.
23. Formula and summary cells remain protected unless an explicitly approved design makes a specific manual source input writable.

## Current Wealth write protections

24. Standard CAD account writes target only approved manual source cells.
25. National Bank FHSA writes I20 only and requires J14 to remain `=I20`.
26. National Bank RRSP writes I22 only and requires K14 to remain `=I22`.
27. National Bank TFSA-USD writes raw USD to J21 only; I21 remains the protected `USDCAD` conversion formula output.
28. Philippines native writes are restricted to I30:I33 through stable IDs.
29. Philippines PHP accounts require J31:J33 to remain their exact approved `PHPCAD` GOOGLEFINANCE formulas.
30. J31:J33 are never writable through the app.
31. If a Philippines account identity no longer matches its expected H-cell label, the backend must fail closed: no edit, no mismatched native value exposed, no CAD equivalent exposed.
32. Account-write payloads contain only `accountId` and `balance`; unexpected fields are rejected.

## Financial mutation integrity

33. Server-side validation is mandatory; browser validation is usability only.
34. Financial writes use `LockService` around the critical section.
35. Identity, target formula state, and required formula guards are rechecked inside the lock when the write depends on them.
36. Money input must be finite, bounded, and follow documented precision policy.
37. Wealth writes update only the approved native source input, then let Sheets recalculate.
38. After a successful Wealth write, Apps Script flushes recalculation, calls `getWealth()`, and returns the complete authoritative object.
39. Wealth UI and cache update only from that confirmed server response; no optimistic Wealth balance patching.
40. Ambiguous results are treated as failure until an authoritative reread proves state.

## Cache safety

41. Service-worker Cache Storage contains only static shell assets and never financial API responses.
42. Cross-origin Apps Script traffic and non-GET financial requests are not service-worker cached.
43. Browser finance snapshots are convenience copies, not authority.
44. Device removal clears authorization, cached finance snapshots, timestamps, and in-memory financial state.
45. Cached financial data must never contain the device key.

## Production and source control

46. Current production claims are checked against GitHub `main`, the live Apps Script deployment, and the live Sheet.
47. Never force-push or destructively reset shared production history.
48. Never delete preserved Apps Script versions casually.
49. Meaningful code changes use a focused branch; trivial documentation/copy maintenance may use a smaller process.
50. Do not combine unrelated features or refactors.
51. Production Apps Script changes create an immutable version and update the existing production Web App deployment so the URL remains stable.
52. Keep a practical rollback point proportional to risk.
53. A production financial write requires explicit owner approval when validating a new or materially changed write boundary.

## Risk-proportional engineering

Before adding a test, deployment gate, audit, or review, ask: **What realistic untested failure would this detect?** If none, skip it.

### LOW risk

Examples: copy, styling, layout, read-only UI, filters/charts, non-financial frontend.

Use: focused inspect → implementation → focused tests → visual check if needed → diff review → ship → sanity check.

Do not add a test Apps Script deployment, rollback branch, broad security audit, or full browser regression without a specific risk.

### MODERATE risk

Examples: extending an already-proven CRUD/cache/authenticated API or an already-proven financial-write pattern without changing the mutation mechanism or formula boundary.

Use: targeted inspect → implementation → focused + relevant regressions → diff review → small integration/smoke check if useful → ship.

Do not re-certify proven architecture merely because another account was added.

### HIGH risk

Examples: first financial-write mechanism, auth change, new writable Sheet area, formula/dependency change, financial migration, or anything capable of corrupting multiple records.

Use: inspect → implement → focused + regression tests → data/security review → synthetic integration if useful → explicit approval → one minimal reversible production validation → exact restoration → authoritative verification → ship/smoke.

Avoid duplicate gates once the realistic risks are covered.

## First-write safety

For the first write into a new financial area:

1. Inspect source cells and dependencies.
2. Implement exact stable IDs and server whitelist.
3. Protect formulas and summaries.
4. Test valid and invalid inputs plus fail-closed behavior.
5. Stop for explicit owner approval.
6. Perform one minimal reversible production write.
7. Restore the exact original native value.
8. Verify formulas and authoritative state are restored.

Once that mechanism is proven, do not repeat full certification for small extensions unless the target, formula relationship, security boundary, or mutation mechanism materially changes.

## Current production write areas

Production-proven write mechanisms now include:

- Expense CRUD.
- Approved Canadian Wealth account balance editing.
- National Bank FHSA/RRSP/TFSA-USD editing.
- Reserve management.
- Philippines-held CAD/PHP account editing with Sheet-driven PHP→CAD conversion.

## Decision rule

Choose the smallest safe design that preserves secret protection, formula protection, financial-data integrity, and authoritative Sheet recalculation. Process exists to catch realistic failures, not to maximize ceremony.