STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — Product and UX Brief

**Owner:** Glen Reyes  
**Source of Truth:** Current production UI and code at main SHA `9cb076cc2bcf62f7b5c29d225bb9da1638939b30`.  
**Related master:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`

## Product definition

Personal Finance is a private, single-owner tool for quickly recording spending and seeing how much money is genuinely available after protected obligations. It is not a general consumer finance platform, accounting suite, or investment trading product.

## User and jobs to be done

The sole intended user is the owner. The app should help him:

1. Capture an expense quickly and accurately from a phone.
2. Correct or remove an expense without corrupting the underlying record.
3. Search and filter transaction history.
4. Understand monthly spending and category/payment patterns.
5. See cash, protected reserves, registered investments, and Crypto without confusing them.
6. Answer the decision question: **How much cash is actually available to use?**

## Domain philosophy

### Expenses

Expense entry should be fast, forgiving in interaction, and strict in data integrity. The user sees familiar buckets, categories, payment methods, dates, descriptions, and optional notes. Immutable IDs and server-side validation protect the data model. The interface may feel immediate, but Google Sheets remains authoritative.

### Spending Insights

Insights turn existing transactions into useful patterns. They are derived views: totals, averages, transaction counts, trends, and breakdowns by bucket, category, and payment method. Filters should explain spending without changing the underlying records.

### Wealth

Wealth is for decision support, not a generic “net worth score.” The screen deliberately separates liquidity, protected reserves, registered investments, and digital assets.

The primary metric is **Available Cash**:

```text
Total Cash
− Tax Reserve
− Income Tax / CPP Reserve
− Emergency Fund
= Available Cash
```

Available Cash is the dominant hero because it answers what is spendable after obligations. Protected money must never look available for discretionary use.

### Investments and Crypto

- TFSA, FHSA, and RRSP are registered investment categories and belong together.
- Crypto is displayed separately as a digital asset because its risk and role differ from registered accounts.
- Long-term investments are conceptually separate from everyday spending and cash availability.

## Current information architecture

Bottom navigation remains intentionally small:

- **Expenses**
- Central **+** action for Add Expense
- **Insights**

Inside Insights, a segmented control switches between:

- **Spending**
- **Wealth**

Do not add a fourth bottom-navigation destination without a demonstrated user need that cannot fit the existing hierarchy.

## Wealth hierarchy to preserve

1. Spending | Wealth segmented control.
2. Dominant Available Cash hero.
3. Cash Position and Protected Reserves.
4. Visible `Total Cash − Reserves = Available Cash` relationship.
5. Investments with TFSA, FHSA, and RRSP.
6. Separate Crypto card.
7. Accounts accordion, collapsed by default.

This ordering moves from the most actionable answer to supporting detail.

## Visual design principles

- Premium, calm blue-and-white interface.
- Mobile-first, optimized primarily for approximately 390–430 px widths.
- Clear typographic hierarchy and high-contrast financial amounts.
- Clean white cards, restrained shadows, rounded controls, and generous spacing.
- Protected reserves use calmer visual treatment than Available Cash.
- Touch targets must be comfortable; primary actions must be easy to reach.
- Financial states need clear loading, saved-data, live, empty, error, and confirmation feedback.
- Preserve safe-area spacing for installed mobile PWA use.
- Do not redesign stable Expenses or Insights areas as collateral work for a Wealth feature.

## Interaction principles

1. **One clear action at a time.** Avoid dense dashboards and competing calls to action.
2. **Fast startup.** Render an authorized cached snapshot when available, then reconcile in the background.
3. **Authority is visible.** Sync status should distinguish live data from saved data.
4. **Destructive actions require confirmation.** Delete Expense and Remove This Device must remain explicit.
5. **Sensitive setup stays private.** The device-key input is password-masked by default and exists only for device setup.
6. **Financial writes are conservative.** Expense optimistic behavior is established; new Wealth writes should wait for server confirmation and the complete recalculated Wealth response.
7. **Editability must be obvious.** Formula-driven or summary rows must not look tappable. Approved manual accounts should have a consistent edit affordance.
8. **No hidden math.** The Sheet supplies authoritative totals; frontend logic formats and presents them.

## Simplicity rules

- Keep HTML, CSS, vanilla JavaScript, Apps Script, Google Sheets, and GitHub Pages.
- Prefer focused improvements over rewrites or new frameworks.
- Keep the three product domains: Expenses, Spending Insights, Wealth.
- Add only the minimum UI needed for the current phase.
- Reuse current components and styles where they fit.
- Keep account details subordinate to summary decisions.
- Preserve current navigation unless strong evidence requires change.

## Things this product intentionally does not need

- A public sign-up or multi-user account system.
- A paid database, paid hosting platform, or paid authentication service.
- Microservices, containers, or a new frontend framework.
- A second Wealth database separate from Google Sheets.
- Brokerage execution, investment recommendations, or live trading.
- Bank credential storage or automatic bank integration as part of the current roadmap.
- A generic arbitrary-cell spreadsheet editor.
- A fourth bottom-navigation tab merely to expose Wealth.
- Frontend calculation of authoritative Sheet totals.
- Broad redesign of stable screens during focused feature work.

## Phase 2A UX boundary

Phase 2A should add a small balance editor only for accounts the server marks as approved manual inputs. The expected interaction is:

```text
Tap approved account → edit balance → submit → wait for authenticated server result
→ Sheet recalculates → full Wealth object returns → screen and Wealth cache refresh
```

Formula-driven, summary, reserve, and dependency-blocked rows remain read-only. Tax Reserve, Income Tax / CPP Reserve, and Emergency Fund editing belongs to Phase 2B after source inspection.
