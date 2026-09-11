STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-12

# Personal Finance PWA — Product and UX Brief

**Owner:** Glen Reyes  
**Source of Truth:** Current production UI and code at application release SHA `ca8f973226b2c0fa301326789c865d848006aa1f`.  
**Related master:** `01_Personal_Finance_App_Technical_Handover_CURRENT.md`

## Product definition

Personal Finance is a private, single-owner tool for quickly recording spending and seeing how much money is genuinely available after protected obligations. It is not a general consumer finance platform, accounting suite, or investment trading product.

## Primary jobs to be done

The app should let the owner:

1. Capture, correct, and delete expenses quickly from a phone.
2. Search and filter transaction history.
3. Understand spending patterns without changing source data.
4. See cash, protected reserves, investments, Crypto, and Philippines-held money without mixing their meanings.
5. Update approved manual balances safely from the app.
6. Answer the decision question: **How much cash is actually available to use?**

## Domain philosophy

### Expenses

Expense entry should be fast in interaction and strict in data integrity. Google Sheets remains authoritative. Immutable IDs and server validation protect updates and deletes.

### Spending Insights

Insights are derived views of existing transactions: totals, averages, counts, trends, and category/payment/bucket breakdowns. Filters must never mutate source data.

### Wealth

Wealth is decision support, not a generic net-worth dashboard. It separates spendable liquidity, protected reserves, registered investments, Crypto, and account-level detail.

The primary metric remains **Available Cash**:

```text
Total Cash
− Tax Reserve
− Income Tax / CPP Reserve
− Emergency Fund
= Available Cash
```

Protected money must never look discretionary.

## Current information architecture

Bottom navigation remains intentionally small:

- **Expenses**
- central **+** action for Add Expense
- **Insights**

Inside Insights, a segmented control switches between:

- **Spending**
- **Wealth**

Do not add a fourth bottom-navigation destination without a demonstrated need.

## Wealth hierarchy to preserve

1. Spending | Wealth segmented control.
2. Dominant Available Cash hero.
3. Cash Position and Protected Reserves.
4. Visible `Total Cash − Reserves = Available Cash` relationship.
5. Investments with TFSA, FHSA, and RRSP.
6. Separate Crypto card.
7. Accounts accordion, collapsed by default.
8. Expanded account groups in this order: **CASH**, **INVESTMENTS**, **PHILIPPINES**.

Account-level detail remains subordinate to the summary decisions above it.

## Philippines account UX

The PHILIPPINES group contains:

- Cash — CAD
- Cash — PHP
- GoTyme
- GCash

Display rules:

- CAD account: primary `C$` balance only.
- PHP accounts: primary `₱` native balance plus smaller secondary `≈ C$` equivalent.
- The CAD equivalent must come from the authoritative Sheet response; the frontend must not calculate FX.
- If identity or formula validation fails, the row must fail closed and show **Unavailable** rather than a possibly mislabeled balance.

Editing rules:

```text
Tap approved account
→ edit native balance
→ Save
→ wait for server confirmation
→ Sheet recalculates
→ full Wealth object returns
→ UI/cache replace with authoritative state
```

PHP accounts use the label **PHP Balance**. National Bank TFSA-USD continues to edit raw USD while displaying its Sheet-derived CAD value.

## Visual design principles

- Premium, calm blue-and-white interface.
- Mobile-first, optimized primarily for approximately 390–430 px widths.
- Clear typographic hierarchy and high-contrast financial amounts.
- Clean white cards, restrained shadows, rounded controls, and generous spacing.
- Protected reserves use calmer visual treatment than Available Cash.
- Touch targets must be comfortable and primary actions easy to reach.
- Financial states need clear loading, saved-data, live, empty, unavailable, error, and confirmation feedback.
- Preserve safe-area spacing for installed mobile PWA use.
- Do not redesign stable Expenses or Insights areas as collateral work for a Wealth feature.

## Interaction principles

1. **One clear action at a time.** Avoid dense dashboards and competing calls to action.
2. **Fast startup.** Render an authorized cached snapshot when available, then reconcile in the background.
3. **Authority is visible.** Sync state must distinguish live data from saved data.
4. **Destructive actions require confirmation.** Delete Expense and Remove This Device remain explicit.
5. **Sensitive setup stays private.** Device-key setup remains masked and separate from financial content.
6. **Wealth writes are conservative.** Never show an unconfirmed optimistic balance.
7. **Editability must be obvious.** Formula/summary/blocked rows must not look editable.
8. **No hidden math.** Sheets supplies authoritative totals and currency conversions.
9. **Foreign currency stays native-first.** Show the account's real native currency first; CAD equivalent is supporting information.

## Simplicity rules

- Keep HTML, CSS, vanilla JavaScript, Apps Script, Google Sheets, and GitHub Pages.
- Prefer focused improvements over rewrites or new frameworks.
- Keep the three product domains: Expenses, Spending Insights, Wealth.
- Reuse established editors and account-row patterns.
- Keep account details subordinate to summary decisions.
- Preserve current navigation and visual language unless a real usability problem is demonstrated.

## Things this product intentionally does not need

- Public sign-up or multi-user accounts.
- Paid database/hosting/auth infrastructure.
- Microservices or a new frontend framework.
- A second Wealth database separate from Google Sheets.
- Brokerage execution or live trading.
- Bank credential storage as part of the current roadmap.
- Generic arbitrary-cell spreadsheet editing.
- Frontend calculation of authoritative Sheet totals or FX conversions.
- Broad redesigns during focused finance work.

## Current product status

The current production product already supports the owner's core day-to-day finance workflow. The Philippines account expansion is complete and production-validated. No immediate UI redesign or new feature is required simply to continue using the app.

Dynamic reserve month targeting remains optional backlog. Preparation for the 2027 Sheet is the next expected maintenance milestone before the 2027 budget year.