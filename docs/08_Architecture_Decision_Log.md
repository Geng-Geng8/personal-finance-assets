STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-12

# Personal Finance PWA — Architecture Decision Log

**Owner:** Glen Reyes  
**Related:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`, `04_Security_and_Architecture_Rules.md`

All decisions below are **Accepted** unless explicitly marked otherwise.

## ADR-001 — Normal runtime does not use Google OAuth

**Decision:** Use the owner device-key Web App architecture for normal production runtime.  
**Reason:** It preserves private, persistent device access without repeated OAuth interaction.  
**Consequence:** Historical OAuth proof-of-concept files/config may remain but are not current runtime.

## ADR-002 — Device key authenticates every financial POST

**Decision:** Keep the key on the owner device and validate it against the Apps Script Script Property for every financial POST.  
**Consequence:** Device removal/unauthorized handling must clear authorization and cached finance state.

## ADR-003 — Google Sheets remains database and calculation engine

**Decision:** Keep authoritative transactions, balances, formulas, reserves, totals, and FX calculations in Google Sheets.  
**Consequence:** Frontend code formats/presents authoritative results but does not compete with Sheet calculations.

## ADR-004 — GitHub Pages hosts the installed PWA

**Decision:** Keep the static PWA on GitHub Pages and call Apps Script cross-origin.  
**Consequence:** Service-worker behavior must remain limited to the static shell and must not cache financial API traffic.

## ADR-005 — Available Cash is the Wealth hero

**Decision:** Keep Available Cash as the dominant Wealth decision metric.  
**Reason:** It answers how much cash is actually usable after protected obligations.

## ADR-006 — Protected reserves are not spendable cash

**Decision:** Tax Reserve, Income Tax / CPP Reserve, and Emergency Fund remain visually and mathematically protected from Available Cash.

## ADR-007 — Long-term investments are separate from spending

**Decision:** Keep TFSA/FHSA/RRSP under Wealth rather than mixing them into Expenses/Spending Insights.

## ADR-008 — Crypto remains a separate asset class

**Decision:** Keep Crypto separate from registered investment totals.

## ADR-009 — Wealth launched read-only before writes

**Decision:** The historical read-only Wealth release remains the foundation for later write phases.  
**Consequence:** Read mapping, summary hierarchy, and API behavior were proven before mutation was enabled.

## ADR-010 — Financial GET APIs are prohibited

**Decision:** Financial reads and writes use authenticated POST only. Bare GET may serve non-financial HTML but never finance data.

## ADR-011 — Formula and summary cells are protected

**Decision:** Formula cells and top-level summaries are never written through a generic interface.  
**Consequence:** A specific manual source must be explicitly allowlisted before it becomes editable.

## ADR-012 — Wealth writes use stable IDs and a server whitelist

**Decision:** The browser sends a logical ID and native balance; Apps Script maps that ID to an exact approved target.  
**Consequence:** Arbitrary Sheet/range/cell/formula APIs remain prohibited.

## ADR-013 — Wealth writes return a full authoritative reread

**Decision:** After a successful write, Apps Script flushes Sheet recalculation, calls `getWealth()`, and returns the complete object.  
**Consequence:** Wealth UI/cache updates only after confirmed server success; no aggressive optimistic balance patching.

## ADR-014 — Production backend releases use immutable Apps Script versions

**Decision:** Meaningful Apps Script releases create a new immutable version and update the existing production Web App deployment so its URL remains stable.  
**Consequence:** Preserve prior verified versions as rollback points; do not delete historical versions casually.

Current Philippines release rollback points are Apps Script Version 36 and frontend SHA `f6eeeac486a0e62340effbe7ce2b2b6340487485`.

## ADR-015 — Initial approved Wealth account editing contract

**Decision:** The first Wealth write mechanism was restricted to explicit manual account IDs, with live identity/formula checks, LockService, bounded money validation, and full authoritative reread.  
**Consequence:** The same proven mutation mechanism is reused for later safe extensions instead of creating separate generic write APIs.

## ADR-016 — Reserve management uses a separate explicit write contract

**Decision:** Reserve operations use `updateWealthReserve` with server-owned reserve IDs and operation semantics rather than account-balance editing.  
**Current limitation:** Tax Reserve and Income Tax / CPP Reserve source targeting remains September 2026-specific.

## ADR-017 — National Bank uses guarded summary formulas and split USD/CAD input-output

**Decision:**

- FHSA writes I20 only and requires J14 `=I20`.
- RRSP writes I22 only and requires K14 `=I22`.
- TFSA-USD writes raw USD to J21 while I21 remains the protected `USDCAD` GOOGLEFINANCE CAD output.

**Reason:** Preserve Sheet-authoritative conversion and summary calculations without frontend FX math.

## ADR-018 — Philippines accounts use a dedicated group and native-currency source cells

**Decision:** Add the four Philippines-held accounts as a separate `philippinesAccounts` backend array and **PHILIPPINES** UI group rather than extending the existing H17:I28 read range through the I29 summary row.

Production mappings:

| Stable ID | Native input | Currency | Conversion guard |
| --- | --- | --- | --- |
| `ph_cash_cad` | I30 | CAD | none |
| `ph_cash_php` | I31 | PHP | J31 PHPCAD formula |
| `gotyme_php` | I32 | PHP | J32 PHPCAD formula |
| `gcash_php` | I33 | PHP | J33 PHPCAD formula |

The PHP accounts display native PHP first and Sheet-derived CAD second. Frontend JavaScript does not calculate PHPCAD.

**Reason:** H30:J33 is a different logical region from H17:I28, and I29 is a Total Cash summary between those areas. A dedicated array preserves the existing Canadian account contract and avoids accidentally treating a summary row as an account.

**Consequences:**

- Accounts count is the combined Canadian + Philippines count.
- The UI has CASH, INVESTMENTS, and PHILIPPINES groups.
- Native I30:I33 values are the only writable sources.
- J31:J33 are read-only formula outputs.
- Successful writes reuse the existing `updateWealthAccountBalance` path.

## ADR-019 — Philippines identity/formula failures fail closed for display as well as writes

**Decision:** If a Philippines row identity no longer matches the expected H-cell label, the backend returns `balance: null`, disables editing, and withholds PHP CAD equivalent data. If a required PHPCAD formula is missing/changed, editing is disabled and the CAD equivalent is unavailable.

**Reason:** Merely disabling writes is insufficient if a row swap could display another account's money under the wrong logical name.

**Consequence:** The UI shows **Unavailable** rather than exposing a potentially mislabeled financial value.

## ADR-020 — Risk-proportional release process

**Decision:** Use engineering process proportional to realistic risk rather than maximum ceremony.

- LOW: focused inspect/test/visual/diff/sanity.
- MODERATE: focused + relevant regression, small smoke/integration when useful.
- HIGH: data/security review plus one explicitly approved reversible production validation when the financial boundary is new or materially changed.

**Reason:** This is a private single-owner app. Extra gates should exist only when they can detect a realistic failure.

**Consequence:** Proven write architecture is not re-certified for every small extension; financial integrity, secret protection, formula protection, and reversible first-write safeguards remain non-negotiable.

## Current production record

The Philippines release is live at application SHA `ca8f973226b2c0fa301326789c865d848006aa1f` with Apps Script Version 37. Full regression record: **261 / 261**. A reversible live GCash validation passed and the exact original native value was restored.

No active architecture migration is planned. Dynamic reserve month targeting remains optional backlog; 2027 Sheet preparation is the next expected maintenance milestone.