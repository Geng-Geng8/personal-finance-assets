# Stage 3 — Production Cutover Plan & Readiness Audit

## Status: READY WITH CONDITIONS

This document defines the audited pre-cutover plan for migrating the Personal Finance App from the legacy Apps Script Web App (Version 20) to the static authenticated GitHub Pages architecture.

**Strict Safety Enforced**: No production code has been modified, no clasp commands have been executed against production, no Google Cloud or OAuth production settings have been changed, and no production Google Sheets data has been touched.

---

## 1. Source State & Branch Identification

- **Cutover Branch**: `stage-3-production-cutover`
- **Base Commit**: `1a5ee6c2e0ff30d55ea0f6cafc69e20ac0ad7b8f` (Approved Stage 2B HEAD)
- **Ancestor Commits**:
  - Stage 2A Approved: `5dd45b29cb251d9b929c6d54f979fa0f1a1997da`
  - Stage 1 Rollback Baseline: `597d2e7425c14dfc300b3890c1ba1dc17598f4aa`
  - Stage 1 HEAD: `40cfc80db40dd59a15b5172f904e0373ffbd0394`
- **Protected Production Script ID**: `1RHBFF7H5Vqnlh97Gt4KuIt_NdBRYgfGCCDTK2zmkMBNbgUtLybxwR4CF`
- **Active Working Production Deployment**: Version 20 (`V2-AddExpense-Big Buttons Release`)

---

## 2. Production Spreadsheet ID Audit

- **Audit Result**: **NOT CONFIDENTLY KNOWN IN REPOSITORY**
- **Analysis**: The legacy production codebase in `apps-script/Code.js` was container-bound to the production Google Sheet and executed via `SpreadsheetApp.getActiveSpreadsheet()`. A comprehensive scan of the repository, documentation, and Git history confirmed that zero production spreadsheet IDs were ever recorded locally. Only the isolated test spreadsheet ID (`1hM8q7JhuZbUmQjJC5Mwx78vC5YBVSOVI6hTOlYmOyDc`) exists in Git.
- **Requirement**: The production Spreadsheet ID must **never be guessed** or substituted with the test ID. It must be manually copied by the owner from the browser address bar of the real production Google Sheet (`https://docs.google.com/spreadsheets/d/<PRODUCTION_SPREADSHEET_ID>/edit`).

---

## 3. Minimal Production Backend Changes

To support the validated frontend (`frontend/api.js`) via the Apps Script API (`scripts.run`), production `apps-script/Code.js` requires the following thin, surgical adapter without rewriting existing trusted logic:

### A. Explicit Spreadsheet Binding
Replace `SpreadsheetApp.getActiveSpreadsheet()` in `getExpenseSheet_()` and timezone resolution with explicit reference:
```javascript
const PRODUCTION_SPREADSHEET_ID = "REPLACE_WITH_CONFIRMED_PRODUCTION_SPREADSHEET_ID";

function getProductionSpreadsheet_() {
  if (PRODUCTION_SPREADSHEET_ID && PRODUCTION_SPREADSHEET_ID !== "REPLACE_WITH_CONFIRMED_PRODUCTION_SPREADSHEET_ID") {
    return SpreadsheetApp.openById(PRODUCTION_SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}
```

### B. Top-Level `apiRequest` Envelope
Expose the standard allowlisted action dispatcher expected by the frontend:
```javascript
function apiRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Request must be an object.");
  }

  const action = String(request.action || "");
  const payload = request.payload == null ? {} : request.payload;

  switch (action) {
    case "getExpenses":
      return {
        ok: true,
        expenses: getExpenses(Boolean(payload && payload.forceRefresh))
      };

    case "addExpense":
      return {
        ok: true,
        result: addExpense(payload)
      };

    case "updateExpense":
      return {
        ok: true,
        result: updateExpense(payload)
      };

    case "deleteExpense":
      const id = typeof payload === "object" && payload !== null ? payload.id : payload;
      return {
        ok: true,
        result: deleteExpense(id)
      };

    default:
      throw new Error("Unsupported API action: " + action);
  }
}
```

### C. Manifest Update (`apps-script/appsscript.json`)
Add the execution API restriction and pinned scope:
```json
{
  "timeZone": "America/Toronto",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "executionApi": {
    "access": "MYSELF"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets"
  ]
}
```

---

## 4. Production Configuration Separation

To prevent accidental mixing of test and production environments:
1. `frontend/config.js` is duplicated or templated into an explicit `frontend/config.prod.js` and `frontend/config.test.js`.
2. Production values remain placeholders (`REPLACE_WITH_PRODUCTION_...`) until real Google Cloud production resources exist.
3. Automated test `tests/stage2/stage2b-integration.test.js` enforces that:
   - No production script ID is targeted by test configurations.
   - Zero secrets or credentials exist in either config.

---

## 5. Google Cloud & OAuth Migration Analysis & Risks

### Sequential Order of Operations:
1. **Google Cloud Project**:
   - Either create a dedicated standard GCP project (e.g., `personal-finance-production`) OR use an existing verified standard project owned by the developer.
   - Record the numeric **Project Number**.
2. **Enable APIs**:
   - Enable the **Google Apps Script API** in the production Cloud project.
3. **Configure OAuth Consent**:
   - User Type: **External**
   - Publishing Status: **Testing**
   - Add owner Google account as an explicit **Test User**.
   - Scopes: `https://www.googleapis.com/auth/spreadsheets`
4. **Create OAuth 2.0 Web Client**:
   - Application Type: **Web application**
   - Authorized JavaScript Origins:
     - `https://geng-geng8.github.io`
     - `http://localhost:8080` (for local pre-release verification)
   - Record the public **OAuth Client ID**.
5. **Link Production Apps Script to GCP Project**:
   - In production script `1RHBFF7H5Vqnlh97Gt4KuIt_NdBRYgfGCCDTK2zmkMBNbgUtLybxwR4CF`, open **Project Settings → Google Cloud Platform (GCP) Project → Change project**.
   - Enter the numeric Project Number.
6. **Deploy API Executable**:
   - Click **Deploy → New deployment**.
   - Type: **API Executable**.
   - Access: **Only myself**.
   - Description: `Stage 3 Production API Cutover`.
   - Record the **Deployment ID**.

### Critical GCP Migration Risks Identified:
- **One-Way Project Switching**: Google Apps Script does not permit reverting a project back to the default Google-managed Cloud project once linked to a standard GCP project.
- **Impact on Version 20 Web App**: Linking the production Apps Script project to a standard Cloud project shifts the OAuth authorization authority to that Cloud project. If the OAuth consent screen is not configured, or if the user is not added as a test user, any user visiting the legacy Version 20 web app URL will encounter authorization errors. Therefore, Steps 1–4 must be completely configured before Step 5 is executed.

---

## 6. Concrete Rollback Procedure

If any issue occurs during or after cutover:

1. **Web Application Availability**:
   - Version 20 (`V2-AddExpense-Big Buttons Release`) remains untouched in Apps Script deployment history.
   - The web app deployment URL remains unchanged and accessible.
2. **Data Safety**:
   - Google Sheets is authoritative and untouched by structural changes.
   - Schema (Columns A:H in `Spending_Master2026`) is identical.
   - If the new frontend fails, opening the Version 20 web app URL immediately restores full operational capacity.
3. **Repository Rollback**:
   - Commit `40cfc80` / `597d2e7` remains permanently pinned as the Stage 1 baseline.
   - If GitHub Pages cutover has occurred on `main`, a clean `git revert` or restoring `main` to `40cfc80` restores the previous Pages site instantly.

---

## 7. Data-Integrity Cutover Validation Sequence

Execution MUST proceed strictly in this sequence:

1. **Step 1: Production Backend Prepared & Deployed**:
   - Verified production Spreadsheet ID placed into `apps-script/Code.js`.
   - Production API Executable deployed with `MYSELF` access.
2. **Step 2: Authenticated READ-ONLY Verification**:
   - Issue an authenticated `getExpenses` call to the production API deployment ID using the owner OAuth token.
   - Verify that HTTP 200 is returned.
   - Verify that the transaction count and financial totals match the real Sheet and Version 20 exactly.
   - Confirm that zero mutations or row modifications occurred.
3. **Step 3: Frontend Production Configuration Connected**:
   - Insert production OAuth Client ID and API Deployment ID into `frontend/config.js`.
4. **Step 4: Controlled Single-Transaction CRUD Verification**:
   - **Add**: Create one synthetic test record (`Item: Stage 3 verification test`, `Cost: 1.00`). Verify row is appended with immutable ID.
   - **Read**: Verify record appears in full list.
   - **Edit**: Update cost to `$2.00` and item to `Stage 3 verification updated`. Verify row is updated in place and ID is unchanged.
   - **Read**: Verify updated values.
   - **Delete**: Delete the synthetic verification record.
   - **Read**: Verify sheet returned to original record count with zero leftover verification rows.
5. **Step 5: Desktop & Mobile UX Verification**:
   - Verify responsive navigation, bottom sheets, search, and category filters.
6. **Step 6: Sign Out & Storage Verification**:
   - Test Sign Out button. Verify token revoked, in-memory state cleared, and local cache purged.
7. **Step 7: Secondary Account Denial Verification**:
   - Confirm non-owner account is denied execution by `MYSELF` policy.

---

## 8. GitHub Pages Cutover Procedure

1. **Current Status**:
   - Pages is configured to publish from branch `main`, path `/`.
2. **Cutover Strategy (Zero Build Overhead)**:
   - Move/promote the validated files from `frontend/*` to the repository root on branch `stage-3-production-cutover`.
   - Test locally with `http://localhost:8080/` to ensure relative paths resolve cleanly at root.
   - Only after full read-only and controlled CRUD validation passes, merge `stage-3-production-cutover` into `main`.
   - GitHub Pages will automatically publish the new static interface at `https://geng-geng8.github.io/personal-finance-assets/` within 1–2 minutes.
   - Zero GitHub Actions workflows or build tools required ($0 ongoing infrastructure).

---

## 9. Automated Quality & Security Checks

All local tests pass:
- `npm run check`: **PASS** (8/8 JS files syntax checked)
- `npm test`: **PASS** (32/32 tests passing)
- `git diff --check`: **PASS** (0 whitespace/formatting warnings)
- Repository Safety Audit:
  - 0 tracked `.clasp.json` files
  - 0 `.clasprc.json` files
  - 0 client secrets (`GOCSPX-`)
  - 0 access tokens (`ya29.`)
  - 0 refresh tokens (`1//`)
  - 0 private keys
  - 0 real financial records committed
  - Production Script ID is guarded against accidental clasp commands

---

## 10. Required Manual Actions to Unblock Cutover

To proceed past the Stop Gate, the owner must provide:
1. **The verified Production Google Sheet ID** (from the URL of the live spreadsheet).
2. **The numeric Project Number** of the standard Google Cloud project to link.
3. **The Web OAuth Client ID** created in that standard Google Cloud project.
