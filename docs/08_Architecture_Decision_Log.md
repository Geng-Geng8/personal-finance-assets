STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Architecture Decision Log

**Owner:** Glen Reyes  
**Source of Truth:** Current production architecture and approved product/security rules.  
**Related:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`, `04_Security_and_Architecture_Rules.md`

All decisions below are **Accepted** unless explicitly marked otherwise.

## ADR-001 — Normal runtime does not use Google OAuth

**Decision:** Move away from the tested OAuth/API-executable runtime and use the device-key Web App architecture for normal production use.  
**Reason:** The private owner app needs simple, persistent device access without repeated OAuth interaction while preserving a server-side authorization check.  
**Consequences:** Historical OAuth POC files and some unused config fields remain in the repository, but they are not current runtime. The device key becomes a high-value secret.  
**Do Not Reconsider Unless:** The ownership model changes, device-key risk becomes unacceptable, or a simpler free owner-auth mechanism is proven end to end.

## ADR-002 — Owner device key authenticates the Web App API

**Decision:** Store the key only in owner-device `localStorage`; validate it against `PERSONAL_APP_DEVICE_KEY` in Apps Script Script Properties for every financial POST.  
**Reason:** This keeps the secret out of Git and lets the static PWA call an owner-executed Apps Script Web App.  
**Consequences:** Device compromise can expose access; device removal must clear the key and cached finance data. Key rotation is an operational responsibility.  
**Do Not Reconsider Unless:** A new authentication design preserves privacy, free operation, and mobile usability with demonstrably lower risk.

## ADR-003 — Google Sheets remains database and calculation engine

**Decision:** Continue using `2026 Buckets Budget` for authoritative transactions, account balances, formulas, reserves, and totals.  
**Reason:** The Sheet already contains the trusted model and calculations, is free, and is understandable to the owner.  
**Consequences:** Apps Script quotas and Sheet structure constrain implementation. Frontend totals must not compete with Sheet formulas.  
**Do Not Reconsider Unless:** Measured scale, reliability, or feature requirements cannot be met safely with Sheets.

## ADR-004 — GitHub Pages hosts the installed PWA

**Decision:** Serve the static HTML/CSS/JavaScript PWA from GitHub Pages.  
**Reason:** It provides free hosting, clean installation, version control, and separation from the Apps Script UI shell.  
**Consequences:** The browser calls a cross-origin Apps Script endpoint and needs a service worker, manifest, and carefully constrained transport.  
**Do Not Reconsider Unless:** GitHub Pages can no longer meet availability, security, or PWA requirements at the free tier.

## ADR-005 — Available Cash is the Wealth hero

**Decision:** Make Available Cash the dominant Wealth metric.  
**Reason:** It answers the primary decision: how much cash remains after protected obligations. Generic net worth is less actionable.  
**Consequences:** Cash and reserves appear before account-level detail and investments.  
**Do Not Reconsider Unless:** The owner's primary financial decision changes.

## ADR-006 — Protected reserves are not spendable cash

**Decision:** Display Tax Reserve, Income Tax / CPP Reserve, and Emergency Fund as protected, then show `Total Cash − Reserves = Available Cash`.  
**Reason:** Money reserved for obligations must not visually invite spending.  
**Consequences:** Reserve editing requires special UX and a separate audited phase.  
**Do Not Reconsider Unless:** The underlying financial policy changes and the owner explicitly reclassifies those funds.

## ADR-007 — Long-term investments are separate from spending

**Decision:** Keep TFSA, FHSA, and RRSP conceptually outside Expenses and Spending Insights, under Wealth.  
**Reason:** Transaction management and long-term asset positioning answer different questions.  
**Consequences:** Wealth remains inside Insights navigation but has its own hierarchy and data source.  
**Do Not Reconsider Unless:** A validated workflow requires a unified cash-flow/investment model and can preserve clarity.

## ADR-008 — Crypto is separate from registered investments

**Decision:** Display Crypto in its own digital-assets card rather than inside TFSA/FHSA/RRSP totals.  
**Reason:** Crypto has a different risk profile and is not a registered account category.  
**Consequences:** `totalInvested` excludes Crypto; the UI reads Crypto independently.  
**Do Not Reconsider Unless:** The Sheet's authoritative classification and the owner's decision model both change.

## ADR-009 — Wealth launched read-only

**Decision:** Release the Wealth dashboard before permitting account writes.  
**Reason:** Read-only delivery proved the data mapping, product hierarchy, caching, API denial rules, and production deployment with lower risk.  
**Consequences:** Stage 6 exposes no Wealth write action. Phase 2A is a separate security-sensitive release.  
**Do Not Reconsider Unless:** Historical reconstruction is required; do not rewrite Stage 6 as if editing already existed.

## ADR-010 — Financial GET APIs are prohibited

**Decision:** Financial reads and writes use authenticated POST only; GET requests containing financial actions are denied.  
**Reason:** Query strings are easily logged, cached, shared, and invoked without the intended secret envelope.  
**Consequences:** Even reads such as `getExpenses` and `getWealth` require the device key in a POST body. Bare GET may serve non-financial HTML only.  
**Do Not Reconsider Unless:** A new authenticated transport is formally threat-modeled and preserves equal or stronger controls.

## ADR-011 — Formula and summary cells are protected

**Decision:** The app never writes formula cells or top-level summary cells through a generic interface.  
**Reason:** Overwriting a formula can silently corrupt all downstream financial decisions.  
**Consequences:** The server must inspect the live target before every write. Manual-looking cells are not automatically approved.  
**Do Not Reconsider Unless:** A specific cell is deliberately converted into a validated source input with owner approval, migration, tests, and rollback.

## ADR-012 — Phase 2 writes use stable IDs and a server whitelist

**Decision:** The client sends `accountId` and `balance`; Apps Script maps the ID to an exact approved cell.  
**Reason:** The browser is untrusted and must not control Sheet topology.  
**Consequences:** Adding or moving an editable account requires an explicit server mapping and tests. Arbitrary cell/Sheet APIs remain prohibited.  
**Do Not Reconsider Unless:** The storage model changes and the replacement still prevents arbitrary client-directed writes.

## ADR-013 — Wealth writes return a full authoritative reread

**Decision:** After a successful approved write, Apps Script rereads `getWealth()` and returns the complete object; the UI does not perform aggressive optimistic updates.  
**Reason:** Sheet formulas and dependencies—not browser math—determine the valid state.  
**Consequences:** The interaction may wait for Apps Script/Sheet latency, but the displayed result is authoritative.  
**Do Not Reconsider Unless:** An equally safe mechanism proves consistency across writes, recalculation, cache, and failures.

## ADR-014 — Preserve rollback branches and immutable Apps Script versions

**Decision:** Meaningful releases create a rollback branch, a new immutable Apps Script version, and an update to the existing production Web App deployment.  
**Reason:** Frontend and backend can fail independently; both need fast, known-good recovery while keeping the endpoint stable.  
**Consequences:** Release records must pair Git SHA, Apps Script version, deployment ID, tests, and smoke results. Versions 20, 22, 23, 28 (prior Stage 6 rollback), and 30 remain preserved.  
**Do Not Reconsider Unless:** A replacement deployment platform provides equal traceability, immutability, and rollback safety.

## ADR-015 — Phase 2A approved manual account editing contract

**Decision:** Implement Wealth account balance editing via the `updateWealthAccountBalance` action, restricted to an explicit whitelist of nine manual accounts (`eq_tfsa`, `wealthsimple_tfsa`, `national_bank_tfsa`, `simplii_chequing`, `simplii_savings`, `eq_savings`, `eq_bank_card`, `eq_geng_cash`, `td_savings`). Enforce `LockService` serialization, live target formula check, column H expected-name verification, two-decimal precision validation (0.00–1,000,000,000.00), and full recalculated `getWealth()` return. Keep I20 (National Bank FHSA), I21 (National Bank TFSA-USD), and I22 (National Bank RRSP) strictly read-only under current rules.  
**Reason:** Restricting mutations to verified manual cells with known formula dependencies eliminates formula overwrite risks, prevents client-driven sheet topology injection, and guarantees downstream dependent recalculation consistency.  
**Consequences:** Only server-allowlisted accounts are editable; arbitrary cell/sheet writes are completely blocked. Summary metrics and formula cells cannot be targeted. Production Apps Script Version 30 deployed; rollback branch `pre-phase-2a-wealth-edit-production` at `9cb076cc2bcf62f7b5c29d225bb9da1638939b30` preserved.  
**Do Not Reconsider Unless:** A formal architectural review re-evaluates the summary dependencies of I20/I22 or a new account is added through the approved release process.
