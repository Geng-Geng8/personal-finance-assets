# Isolated Stage 2 Apps Script POC

This code must be installed only in a separate test Apps Script project linked to a separate standard Google Cloud project. Never push it to the production Script ID in the repository root `.clasp.json`.

## Required test resources

- Spreadsheet title: `Stage 2 Auth POC - Personal Finance`
- Sheet tab: `Spending_Master2026`
- Columns A:H: exactly the headers in `fake-transactions.csv`
- Data: synthetic rows from `fake-transactions.csv` only

The backend is pinned to the verified fake spreadsheet ID in `Code.js`. It refuses to access that spreadsheet unless its actual title is exactly `Stage 2 Auth POC - Personal Finance`, the `Spending_Master2026` tab exists, and its A:H headers match the expected schema.

The nested `.clasp.json` points only to the isolated test Script ID. Run any permitted test-only `clasp` command from this directory and inspect the target before pushing.

## API deployment

Create an **API Executable** deployment from this separate test project and choose **Only myself**. Do not create a web-app deployment. The test project contains no `doGet()` or `doPost()` endpoint.

The `executionApi.access` manifest setting must remain `MYSELF`, and `devMode` is intentionally disabled in the frontend.
