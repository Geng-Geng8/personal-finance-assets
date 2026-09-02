# Isolated Stage 2 Apps Script POC

This code must be installed only in a separate test Apps Script project linked to a separate standard Google Cloud project. Never push it to the production Script ID in the repository root `.clasp.json`.

## Required test resources

- Spreadsheet title: `Stage 2 Auth POC - Personal Finance`
- Sheet tab: `Spending_Master2026`
- Columns A:H: exactly the headers in `fake-transactions.csv`
- Data: synthetic rows from `fake-transactions.csv` only

The test Apps Script project must define these Script Properties:

- `TEST_SPREADSHEET_ID`: the fake spreadsheet ID
- `TEST_SPREADSHEET_TITLE`: `Stage 2 Auth POC - Personal Finance`
- `TEST_SHEET_NAME`: `Spending_Master2026`

The backend refuses to access a spreadsheet unless its actual title exactly matches the required POC title and its A:H headers match the expected schema.

## API deployment

Create an **API Executable** deployment from this separate test project and choose **Only myself**. Do not create a web-app deployment. The test project contains no `doGet()` or `doPost()` endpoint.

The `executionApi.access` manifest setting must remain `MYSELF`, and `devMode` is intentionally disabled in the frontend.
