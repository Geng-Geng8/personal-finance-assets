# Current architecture

## Request path

```text
Browser
  → Apps Script HTML Service
  → google.script.run
  → Apps Script backend
  → Google Sheets
```

Apps Script HTML Service evaluates `Index.html`. The page includes `Styles.html` and `JavaScript.html` through Apps Script template directives. The browser uses asynchronous `google.script.run` calls to invoke the backend functions in `Code.js`. The backend reads and mutates the `Spending_Master2026` sheet, which remains the source of truth.

The current deployment is an Apps Script web application. This document does not describe a future hosting model.

## Read and cache flow

- The browser keeps a versioned `localStorage` cache so it can render recently fetched expenses quickly.
- A background authoritative refresh reconciles the browser's state with Google Sheets.
- The Apps Script backend uses `CacheService` as a short-lived read cache. Its current time-to-live is 30 seconds, and oversized payloads bypass the cache.
- A forced refresh skips the server cache and reads Google Sheets directly.

The caches improve responsiveness but are not authoritative. Google Sheets is authoritative.

## Mutation flow

- Add, update, and delete requests are validated in the Apps Script backend.
- `LockService.getScriptLock()` serializes mutations so simultaneous requests do not race while resolving IDs or writing rows.
- Updates and deletes locate the current sheet row by immutable record ID.
- The browser applies optimistic add, update, and delete changes to its in-memory state for immediate feedback.
- Failed optimistic mutations are rolled back or followed by an authoritative refresh.
- After every successful server mutation, the Apps Script `CacheService` entry is invalidated because the cached read is stale.
- The browser updates its local cache after successful optimistic synchronization and periodically reconciles with the sheet.

## Trust boundaries

Browser state and browser validation are untrusted. The Apps Script backend enforces mutation validation and controls all Google Sheets access. Filtering, searching, sorting, summaries, and charts stay in the browser and must not mutate the sheet.
