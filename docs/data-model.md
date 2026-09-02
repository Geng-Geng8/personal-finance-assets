# Current data model

## Source of truth

Google Sheets is the authoritative data store. The application reads and writes the `Spending_Master2026` sheet through the Apps Script backend. Browser filtering, searching, and sorting operate on in-memory copies and must never mutate Google Sheets.

The header row is row 1. Transaction records begin on row 2 and use columns A through H.

| Column | Field | Current meaning |
| --- | --- | --- |
| A | ID | Unique record identifier. The ID is immutable after creation. |
| B | Date | Transaction date. The backend exchanges it with the browser as `YYYY-MM-DD`. |
| C | Cost | Numeric transaction amount. New and updated values are normalized to cents before being written. |
| D | Bucket | Existing application bucket. |
| E | Category | Existing category belonging to the selected bucket. |
| F | Item | Required transaction description. |
| G | Notes | Optional transaction notes. |
| H | Payment Method | Existing application payment method. |

## Integrity rules

- All writes must be validated by the Apps Script backend. Browser validation is only an early usability check.
- Dates must be real calendar dates; JavaScript date rollover must not make an impossible input valid.
- Costs must be finite, positive currency values and are normalized to cents for new and updated records.
- Bucket, category, and payment method values must satisfy the backend's existing allowed-value lists.
- Updates and deletes identify records by immutable ID, never by a browser-supplied row number. The backend resolves the current row for that ID at mutation time.
- Browser search, filters, charts, summaries, and sorting are derived views. They do not change the sheet's rows or schema.

No private transaction data is stored in this repository documentation.
