# Stage 2A authentication POC test results

## Validation status

**Not fully validated.** Local controls and backend behavior pass, but Google OAuth, API Executable access enforcement, live fake-Sheet CRUD, and runtime browser storage inspection require isolated Google test resources that have not yet been created.

Last local run: 2026-09-02

## Security test matrix

| # | Test | Expected | Actual result | Status |
| --- | --- | --- | --- | --- |
| 1 | No OAuth token | Google endpoint denies the request | Frontend guard prevents an API call without an in-memory token. Direct request to a deployed endpoint not yet run. | BLOCKED |
| 2 | Invalid token | Google endpoint denies the request | Requires test API deployment ID. | BLOCKED |
| 3 | Expired or invalid authorization | Request denied and in-memory state cleared | Frontend has an expiry guard and clears state on HTTP 401. Live expiry/revocation test not yet run. | BLOCKED |
| 4 | Valid token from authorized owner | Request allowed | Requires test OAuth client and test API deployment. | BLOCKED |
| 5 | Valid token from another Google account | Google denies before backend execution | Requires a safe secondary test account and test API deployment. | BLOCKED |
| 6 | Read fake expenses | Returns synthetic A:H records | Passed against the in-memory fake Sheet; deployed test Sheet pending. | PARTIAL |
| 7 | Add fake expense | Validated fake row is added | Passed locally, including generated ID and mutation lock; deployed test Sheet pending. | PARTIAL |
| 8 | Edit fake expense | Record is found by ID and ID remains immutable | Passed locally; deployed test Sheet pending. | PARTIAL |
| 9 | Delete fake expense | Record is found and deleted by ID | Passed locally; deployed test Sheet pending. | PARTIAL |
| 10 | Impossible date `2026-02-31` | Rejected server-side before mutation | Passed locally with zero lock/write events. | PARTIAL |
| 11 | Invalid bucket/category pair | Rejected server-side before mutation | Passed locally with zero lock/write events. | PARTIAL |
| 12 | Invalid or negative cost | Rejected server-side before mutation | Non-numeric, negative, and zero values passed local rejection tests with zero lock/write events. | PARTIAL |
| 13 | OAuth token inspection | No token in persistent browser storage or repository | Static scan passed: frontend has no `localStorage`, `sessionStorage`, or IndexedDB calls. Runtime DevTools inspection pending. | PARTIAL |
| 14 | Repository scan | No secrets, tokens, clasp credentials, or private transactions | Automated tracked-file scan passed for known credential formats and `.clasprc.json`; reviewed seed rows are explicitly synthetic. | PASS |
| 15 | Production safety | Production Sheet, script, Version 20, and settings unchanged | Git diff proves production application files and icons are unchanged. No production clasp/deploy/Sheet command was run. Post-POC live metadata check remains pending. | PARTIAL |

`PARTIAL` means the behavior passed locally but still requires a real request against the isolated test deployment. It does not count as final security validation.

## Automated local results

Commands:

```text
npm run check
npm test
```

Result at the documentation point:

- 24 tests passed.
- 0 tests failed.
- Production Stage 1 tests remained green.
- Test Apps Script and POC frontend JavaScript syntax checks passed.
- The test manifest parsed successfully.
- Only `apiRequest` is a top-level test-backend function.
- The API action allowlist rejected an unsupported action.
- The spreadsheet-title boundary rejected a production-like spreadsheet title.
- No production application file differed from the Stage 2 branch point.

## Google configuration created

None. No Cloud project, OAuth client, test Apps Script project, API deployment, or test spreadsheet has been created by this repository work.

## Manual configuration required before live tests

The following must be created manually and kept separate from production:

1. Test spreadsheet titled `Stage 2 Auth POC - Personal Finance` containing only the fake CSV data.
2. Standard Cloud project named clearly for the Stage 2 Auth POC.
3. Apps Script API enabled in that test Cloud project.
4. OAuth consent configuration in Testing status.
5. Owner account and a safe secondary Google account added as test users when using an External audience.
6. OAuth Web application client with the exact GitHub Pages origin as an authorized JavaScript origin.
7. Separate test Apps Script project linked to the same standard Cloud project.
8. Test script properties pointing only to the fake spreadsheet.
9. API Executable deployment restricted to `MYSELF`.

Do not configure or link the production Apps Script project during these steps.

## Evidence still required

- Test standard Cloud project ID and numeric project number.
- Test spreadsheet ID and confirmation of its exact title.
- Test Apps Script Script ID.
- OAuth Web client ID; do not provide a client secret or downloaded credential JSON.
- Test API Executable deployment ID and screenshot/manual confirmation that access is `Only myself`.
- Results from direct missing-token, invalid-token, owner-token, secondary-account-token, and expired-token requests.
- Live fake-Sheet CRUD and validation results.
- Browser DevTools storage inspection after authorization and sign-out.
- Read-only confirmation that production Version 20 and production deployment settings remain unchanged.

## Current recommendation

**APPROVE WITH CONDITIONS** for continuing the isolated POC. Do not approve production migration. Approval depends on completing every blocked and partial test against isolated resources with no production changes.
