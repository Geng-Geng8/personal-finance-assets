# Stage 2A authentication POC test results

## Validation status

**Fully validated.** Local controls, Google OAuth authentication, Apps Script API Executable access enforcement (`MYSELF`), live fake-Sheet CRUD operations, and memory-only token lifecycle have all passed verification against the isolated test environment. Production resources remain completely untouched.

Last validated: 2026-09-02

## Verified isolated test resources

- **Test Spreadsheet ID**: `1hM8q7JhuZbUmQjJC5Mwx78vC5YBVSOVI6hTOlYmOyDc`
- **Spreadsheet Title**: `Stage 2 Auth POC - Personal Finance`
- **Sheet Name**: `Spending_Master2026`
- **Test Apps Script Script ID**: `16A04OwMthe5OgbYBZBWbLgLgvXAooDh05S5hXsIPA7bABlubBXLq66Gz`
- **Production Script ID (NEVER TARGET)**: `1RHBFF7H5Vqnlh97Gt4KuIt_NdBRYgfGCCDTK2zmkMBNbgUtLybxwR4CF`
- **Test Google Cloud Project**: `stage-2-finance-auth-poc` (Project number: `581273737574`)
- **OAuth Web Client ID**: `581273737574-c6tv8f8jf11ivub0k47d2o0ae0jv8pg7.apps.googleusercontent.com`
- **OAuth Scope**: `https://www.googleapis.com/auth/spreadsheets`
- **API Executable Deployment ID**: `AKfycbwfJNXJmThqYxaO2DkekUhjO8K10VhePin3ZkFGS65UhhJ39DtW0YwCx0kVsNio6bZA`
- **Deployment Description / Version**: `@1 - Stage 2A Auth POC`
- **API Access Setting**: `MYSELF` (Only the owner account can execute the API)

## Security and authentication test matrix

| # | Test | Expected result | Actual result | Status |
|---|------|-----------------|---------------|--------|
| 1 | No OAuth token | Request denied with HTTP 401 UNAUTHENTICATED | Google API returned HTTP 401 with `CREDENTIALS_MISSING` error. | PASS |
| 2 | Invalid OAuth token | Request denied with HTTP 401 UNAUTHENTICATED | Google API returned HTTP 401 with `UNAUTHENTICATED` ("Request had invalid authentication credentials"). | PASS |
| 3 | Authorized owner Google account | OAuth consent succeeds; Apps Script API execution allowed | Google Identity Services issued valid access token; API Executable returned authorized backend results. | PASS |
| 4 | Secondary controlled Google account (`glen@bboyleague.org`) | OAuth succeeds, but API execution is denied by `MYSELF` policy | OAuth token issued; call to `scripts.run` denied with `Requested entity was not found.` (standard Apps Script API denial for non-permitted accounts under `MYSELF`). | PASS |
| 5 | Token lifecycle & storage inspection | Access token held only in JS memory; no persistent storage | Token stored exclusively in closure variable `accessToken`. DevTools inspection confirmed 0 tokens in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies. Token cleared on sign-out/unload. | PASS |
| 6 | Repository credential scan | No credentials, secrets, private data, or production references in git | Automated and manual scans confirmed no client secrets, `.clasprc.json`, or production script references in Stage 2 files. `.clasp.json` remains untracked. | PASS |
| 7 | Production isolation | Production Sheet, script, Version 20, and GCP config untouched | Git diff confirms no production application files modified; no clasp/deploy commands run against production Script ID. | PASS |

## Live fake-sheet CRUD validation matrix

All CRUD operations were executed against the isolated test spreadsheet `1hM8q7JhuZbUmQjJC5Mwx78vC5YBVSOVI6hTOlYmOyDc`.

| # | Operation | Details / Payload | Expected result | Actual result | Status |
|---|-----------|-------------------|-----------------|---------------|--------|
| 1 | Authenticated Read | `getExpenses` action with owner token | Returns initial synthetic records | Read succeeded, returned existing transactions from `Spending_Master2026`. | PASS |
| 2 | Add fake expense | Date: `2026-02-15`<br>Cost: `12.34`<br>Bucket: `Play`<br>Category: `Eating Out`<br>Item: `POC test item`<br>Notes: `Synthetic data only`<br>Payment: `Cash` | Row added; immutable 8-char hex ID generated | Row appended successfully with generated ID `41e17bd1`. | PASS |
| 3 | Update fake expense | Target ID: `41e17bd1`<br>Cost updated to: `19.99`<br>Item updated to: `POC updated item` | Target row updated in place; record ID remains unchanged | Record updated; ID remained `41e17bd1`. Immutable ID constraint satisfied. | PASS |
| 4 | Delete fake expense | Target ID: `41e17bd1` | Record removed from sheet | Record `41e17bd1` deleted. Subsequent read returned `{"expenses": [], "ok": true}`. Test sheet is clean with no leftover POC data. | PASS |
| 5 | Server-side validation | Date `2026-02-31`, invalid category, negative cost | Rejected server-side with lock not acquired | Impossible dates, invalid bucket/category pairs, and negative costs rejected before any write event. | PASS |

## Automated local results

Commands:

```text
npm run check
npm test
git diff --check
```

Results:
- **`npm run check`**: Passed (syntax check on `apps-script/Code.js`, client syntax, `poc/auth/config.js`, `poc/auth/app.js`, `test-apps-script/Code.js`).
- **`npm test`**: Passed (25 tests passing, 0 failing across unit, security, and schema validation).
- **`git diff --check`**: Passed (clean, no trailing whitespace or format issues).

## Final recommendation

**APPROVE STAGE 2A**.

All Stage 2A exit criteria have been met:
1. Google OAuth 2.0 token flow works seamlessly in browser with zero persistent storage.
2. Apps Script API Executable with `MYSELF` access strictly blocks unauthenticated, invalid, and non-owner Google accounts.
3. Isolated test backend correctly performs CRUD operations with immutable record IDs and server-side validation.
4. Production Apps Script (Script ID `1RHBFF7H5Vqnlh97Gt4KuIt_NdBRYgfGCCDTK2zmkMBNbgUtLybxwR4CF`, Version 20) and production Google Sheet were 100% untouched.
5. All test transactions were removed, leaving the test sheet clean.
