# Stage 2A authentication proof-of-concept design

## Status and scope

This is an isolated proof of concept. It is not a production migration and must not be treated as validated until every live security test in `stage-2-auth-test-results.md` passes.

The production Apps Script project, Version 20 deployment, production spreadsheet, production Cloud configuration, `main`, and the `stage-1-baseline` history are outside the POC boundary.

## Source inspection findings

The current application uses these Apps Script services:

- `SpreadsheetApp` for read/write access to the bound spreadsheet.
- `HtmlService` for the current web UI.
- `CacheService` for short-lived read caching.
- `LockService` for serialized mutations.
- `Utilities` for date formatting, payload sizing, and IDs.

Only the Spreadsheet service requires access to financial user data. The current manifest does not explicitly declare `oauthScopes`, so the exact automatically inferred production scope must be confirmed read-only in Apps Script **Overview → Project OAuth Scopes**. From the methods in the source, the bound application requires read/write access through either:

- `https://www.googleapis.com/auth/spreadsheets.currentonly`, or
- the broader `https://www.googleapis.com/auth/spreadsheets` scope if Apps Script inferred it.

The POC cannot use `getActiveSpreadsheet()`. Google documents that active-container methods are unavailable when a bound script is invoked through the Apps Script API. The isolated backend therefore uses `SpreadsheetApp.openById()` with a fake test spreadsheet, which requires:

```text
https://www.googleapis.com/auth/spreadsheets
```

No Drive, Gmail, Calendar, refresh-token, service-account, or custom identity scope is required by the POC.

## POC architecture

```text
Public GitHub Pages test page
  → Google Identity Services OAuth token model
  → short-lived access token held only in JavaScript memory
  → POST https://script.googleapis.com/v1/scripts/{DEPLOYMENT_ID}:run
  → API Executable deployment with access = MYSELF
  → apiRequest(request)
  → validation and action allowlist
  → LockService for mutations
  → explicitly identified fake test spreadsheet
```

Required isolated resources:

1. A fake test Google Sheet titled exactly `Stage 2 Auth POC - Personal Finance`.
2. A separate test Apps Script project.
3. A separate standard Google Cloud project.
4. An OAuth 2.0 Web application client in that test Cloud project.
5. An Apps Script API Executable deployment from the test script with access set to `MYSELF`.

The test script and OAuth client must use the same standard Cloud project, and the Apps Script API must be enabled in that project.

## Trust boundaries

- GitHub Pages and all browser input are untrusted.
- The OAuth client ID and API deployment ID are public identifiers, not secrets.
- The OAuth access token is sensitive and exists only in a closure variable in the active page.
- Google's OAuth endpoint authenticates the user and issues the token.
- The Apps Script API validates the bearer token and enforces the API Executable's `MYSELF` access policy before `apiRequest` can run.
- `apiRequest` accepts only four action names and performs server-side payload validation.
- Google Sheets remains authoritative inside the test boundary.
- The backend verifies both the configured spreadsheet ID and the expected test spreadsheet title before any read or mutation.

The backend does not rely on a caller-supplied email, frontend flag, or shared password to authorize access.

## Authentication flow

1. The page loads the Google Identity Services browser library.
2. A user gesture calls `requestAccessToken()` for the single required Sheets scope.
3. Google shows account selection and consent.
4. Google returns a short-lived access token to the callback.
5. The page records the token and its calculated expiry time in JavaScript memory only.
6. An API action sends the token in the `Authorization: Bearer` header to `scripts.run`.
7. The request invokes only `apiRequest` with one plain JSON object containing an allowed action and payload.
8. On HTTP 401, expiry, revocation, or sign-out, the page clears its in-memory token and requires a new user-initiated authorization.

The page does not silently renew authorization. It requests a new short-lived token through a user gesture when needed.

## Token lifecycle

- Storage: memory only.
- Persistence: none.
- Refresh token: none.
- Browser reload or tab close: token is lost.
- Expiry: tracked from the OAuth response; expired tokens are cleared before API calls.
- Sign out: revoke the current token when possible, then clear all in-memory token state.
- Logging: tokens must never be written to the DOM, console, repository, test output, URL, or error report.

The fake expense data may be stored in browser memory for rendering, but OAuth tokens must not be stored in `localStorage`, `sessionStorage`, IndexedDB, cookies, or service-worker caches.

## API contract

The sole intentional entry point is:

```javascript
function apiRequest(request) {
  // Validate the envelope and allowlisted action.
  // Route to an internal test-safe implementation.
}
```

Allowed actions:

- `getExpenses`
- `addExpense`
- `updateExpense`
- `deleteExpense`

All helper functions remain inside a private module closure. The API accepts and returns only JSON-compatible primitives, arrays, and objects, as required by `scripts.run`.

## Why there is no client secret

This is a browser-based public client. Any value shipped to GitHub Pages can be inspected, so a client secret cannot be kept secret there. Google Identity Services' token model uses the public OAuth client ID and an authorized JavaScript origin; it does not require a client secret in frontend code.

## Why a public `doPost()` is rejected

A web-app `doPost()` endpoint would create a separate public HTTP authorization surface. A password or shared secret embedded in frontend JavaScript would be recoverable by anyone who loads the page. The POC instead uses Google's authenticated `scripts.run` API and the API Executable deployment access policy. The test backend contains no `doGet()` or `doPost()` function.

## Why `MYSELF` matters

`MYSELF` instructs Google to allow only the account that deployed the API executable to run it. A valid Google access token from another account must therefore be denied before backend code executes. This is the primary account-authorization control; the script's action allowlist and validation are separate application controls.

Changing API access to `ANYONE`, `DOMAIN`, or `ANYONE_ANONYMOUS` is outside this POC and must fail review.

## Google Cloud requirements and blockers

The POC cannot make a real `scripts.run` call until all of these isolated test resources exist:

- A standard Google Cloud project dedicated to this test tier.
- Apps Script API enabled in that project.
- OAuth consent configured in Testing mode with explicit test users as applicable.
- An OAuth Web application client whose authorized JavaScript origin matches the GitHub Pages origin (and an explicit localhost origin if local browser testing is used).
- A separate Apps Script project linked to the same standard Cloud project.
- An API Executable deployment with access restricted to `MYSELF`.
- Script Properties that contain only the fake test spreadsheet ID and expected test title.

Google may show an unverified-app warning because the Sheets scope is sensitive. That warning is acceptable only for this owner-only testing tier; broader production use would require a separate policy and verification review.

## Production migration risks

- Switching an Apps Script project from its default Cloud project to a standard project is not reversible back to a default project and can require reauthorization.
- The current backend's `getActiveSpreadsheet()` calls are incompatible with API execution and would need explicit spreadsheet selection.
- A browser token for `SpreadsheetApp.openById()` requires the full read/write Sheets scope, which grants more account-level authority than a custom backend would ideally expose.
- OAuth consent, test-user status, browser-origin configuration, ownership changes, and API deployment versions can all break authentication independently.
- A production migration would replace `google.script.run` transport behavior and error handling throughout the UI.

For those reasons, no production Cloud project, script project, deployment, spreadsheet, or frontend file is changed during Stage 2A.

## Rollback and safety strategy

- Stage 1 remains at `40cfc80db40dd59a15b5172f904e0373ffbd0394` with rollback commit `597d2e7425c14dfc300b3890c1ba1dc17598f4aa` unchanged.
- All Stage 2A files live on `stage-2-auth-poc` and are isolated under `poc/`, `test-apps-script/`, `tests/stage2/`, and Stage 2 documentation.
- No root `clasp push`, production deploy, or production Sheet mutation is part of the POC procedure.
- Test resource names must contain `Stage 2 Auth POC` and the backend rejects a spreadsheet whose title does not exactly match the test title.
- `devMode` remains `false` in browser API calls so tests exercise the explicitly deployed test version.

## Official references

- [Execute functions with the Apps Script API](https://developers.google.com/apps-script/api/how-tos/execute)
- [`scripts.run` REST reference](https://developers.google.com/apps-script/api/reference/rest/v1/scripts/run)
- [Apps Script and standard Google Cloud projects](https://developers.google.com/apps-script/guides/cloud-platform-projects)
- [Container-bound script limitations](https://developers.google.com/apps-script/guides/bound)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Apps Script authorization scopes](https://developers.google.com/apps-script/concepts/scopes)
- [API executable access settings](https://developers.google.com/apps-script/manifest/web-app-api-executable)
