STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-03

# Personal Finance PWA — UI Screenshot Reference

**Owner:** Glen Reyes  
**Visual source priority:** User-provided current production screenshots, then current authenticated production UI, then current code.  
**Related UX brief:** `02_Product_and_UX_Brief.md`

## Evidence status

No user-provided production screenshots were present in this workspace. A live public production inspection on 2026-09-03 verified the unauthenticated Device Setup screen. Authenticated financial screens were not opened because the device key was not requested, displayed, or entered.

Descriptions marked **CODE-DEFINED REFERENCE** identify current components and behavior from production code; they are not substitutes for visual screenshot evidence. Every missing authenticated image is marked **SCREENSHOT NEEDED**.

## Screenshot index

| ID | Screen | Evidence status |
| --- | --- | --- |
| UI-00 | Device Setup Gate | LIVE VISUAL OBSERVATION — not an authenticated finance screen |
| UI-01 | Expenses | SCREENSHOT NEEDED |
| UI-02 | Add Expense | SCREENSHOT NEEDED |
| UI-03 | Spending Insights | SCREENSHOT NEEDED |
| UI-04 | Wealth Top | SCREENSHOT NEEDED |
| UI-05 | Wealth Investments | SCREENSHOT NEEDED |
| UI-06 | Accounts Collapsed | SCREENSHOT NEEDED |
| UI-07 | Accounts Expanded | SCREENSHOT NEEDED |
| UI-08 | Installed Mobile PWA | SCREENSHOT NEEDED |

## UI-00 — Device Setup Gate

**Evidence:** Live visual observation of the production GitHub Pages URL on 2026-09-03 at a desktop browser viewport.  
**Screen:** Owner-device authorization setup.  
**Important components:** Finance icon, `Personal Finance` heading, private-key explanation, masked 64-character input, Show/Hide control, disabled-until-valid `Set Up Device` button, status/help text.  
**Hierarchy:** A single centered white card on a light neutral background; icon and title first, key field second, primary action third, help text last.  
**Interaction:** Key is masked by default. Show/Hide toggles visibility. Primary action remains disabled until the input matches the expected format.  
**Preserve:** Minimal single-task layout, clear privacy language, masked default, constrained Show/Hide control, blue primary action, no financial data before authorization.  
**Known issues:** None observed in the public gate. Mobile appearance still needs an explicit current screenshot.

## UI-01 — Expenses

**Evidence:** **SCREENSHOT NEEDED**. The following is a **CODE-DEFINED REFERENCE**, not visual confirmation.  
**Screen:** Default authenticated home.  
**Important components:** Header, refresh, Remove This Device, month/status row, total spent, transaction count, average, search, filters, active filters, transaction cards/list, loading/empty states, bottom navigation.  
**Hierarchy:** Monthly summary before discovery controls; transactions are the primary scrolling content; bottom navigation stays persistent.  
**Interaction:** Cached startup may render saved transactions before background synchronization; search and filters update derived views; cards open editing.  
**Preserve:** Fast startup, readable totals, clear live/saved-data status, central Add action, current blue/white mobile layout.  
**Known issues:** Unknown until a current authenticated mobile screenshot is captured.

## UI-02 — Add Expense

**Evidence:** **SCREENSHOT NEEDED**. **CODE-DEFINED REFERENCE** only.  
**Screen:** Expense editor opened for a new transaction.  
**Important components:** Close control, amount entry, payment method choices, bucket choices, dependent category choices, date, item, notes, validation area, Save button.  
**Hierarchy:** Amount and core categorization choices precede supporting detail.  
**Interaction:** Bottom-sheet/editor pattern; category options depend on selected bucket; save uses server validation.  
**Preserve:** Large touch targets, one clear Save action, visible errors, no duplicate amount field, mobile keyboard usability.  
**Known issues:** Unknown until captured at approximately 390–430 px.

## UI-03 — Spending Insights

**Evidence:** **SCREENSHOT NEEDED**. **CODE-DEFINED REFERENCE** only.  
**Screen:** Insights with Spending selected.  
**Important components:** Spending | Wealth segmented control, date-range controls, total/count/average, monthly trend, bucket/category/payment breakdown charts and legends.  
**Hierarchy:** Segment and filters first; summary metrics before charts; charts provide progressively deeper explanation.  
**Interaction:** Date filters update derived metrics and charts without writing to the Sheet.  
**Preserve:** Spending and Wealth inside one Insights destination, legible charts, consistent color mapping, clear reset behavior.  
**Known issues:** Unknown until a current authenticated screenshot is captured.

## UI-04 — Wealth Top

**Evidence:** **SCREENSHOT NEEDED**. **CODE-DEFINED REFERENCE** only.  
**Screen:** Top portion of Wealth.  
**Important components:** Spending | Wealth segmented control, dominant Available Cash hero, Cash Position, Protected Reserves, Tax Reserve, Income Tax + CPP, Emergency Fund, and the arithmetic relationship.  
**Hierarchy:** Available Cash is visually dominant. Total Cash and protected reserves explain it immediately below.  
**Interaction:** Stage 6 is read-only. Phase 2A must not make summary or reserve values tappable.  
**Preserve:** Available Cash primacy, calm reserve styling, explicit `Total Cash − Reserves = Available Cash`, clear separation between spendable and protected money.  
**Known issues:** Visual state not independently confirmed without authenticated screenshot.

## UI-05 — Wealth Investments

**Evidence:** **SCREENSHOT NEEDED**. **CODE-DEFINED REFERENCE** only.  
**Screen:** Portfolio portion of Wealth.  
**Important components:** Total Invested banner; TFSA, FHSA, and RRSP mini-cards; separate Crypto/digital-assets card.  
**Hierarchy:** Registered totals are grouped; Crypto follows as a separate asset class.  
**Interaction:** Read-only in Stage 6. Individual approved account editing belongs in the Accounts area, not the summary cards.  
**Preserve:** Registered investment grouping, separate Crypto presentation, clear amounts, restrained visual density.  
**Known issues:** J14 and K14 are manual summary cells not currently formula-linked to I20/I22; the screenshot must not be used to infer editability.

## UI-06 — Accounts Collapsed

**Evidence:** **SCREENSHOT NEEDED**. **CODE-DEFINED REFERENCE** only.  
**Screen:** Wealth Accounts accordion in its default collapsed state.  
**Important components:** Ledger/Accounts label, account count, chevron.  
**Hierarchy:** Account-level detail remains subordinate to decision summaries.  
**Interaction:** Native details/summary accordion expands on tap.  
**Preserve:** Collapsed-by-default behavior and compact footprint.  
**Known issues:** Unknown until screenshot capture.

## UI-07 — Accounts Expanded

**Evidence:** **SCREENSHOT NEEDED**. **CODE-DEFINED REFERENCE** only.  
**Screen:** Expanded Wealth account ledger.  
**Important components:** Cash Accounts group, Investment Accounts group, account names, formatted balances.  
**Hierarchy:** Group labels separate liquidity accounts from investments.  
**Interaction:** Stage 6 rows are display-only. Phase 2A may add an edit affordance only to accounts the server marks editable; formula and blocked accounts must remain visibly read-only.  
**Preserve:** Clear grouping, aligned balances, readable names, compact rows, no arbitrary cell controls.  
**Known issues:** Current backend type classification is name-based; visual inspection cannot establish security or editability.

## UI-08 — Installed Mobile PWA

**Evidence:** **SCREENSHOT NEEDED**.  
**Screen:** App launched from the phone home screen in standalone mode.  
**Important components to capture:** Status/safe-area spacing, app header, bottom navigation, central Add button, one primary content screen, and absence of browser chrome.  
**Hierarchy and interaction:** Should match the web app while respecting portrait safe areas and installed-PWA relaunch behavior.  
**Preserve:** Portrait-first layout, edge-to-edge polish, usable bottom navigation, no clipped controls.  
**Known issues:** Cannot be assessed without a current installed-PWA capture.

## Screenshot capture rules

When adding visual references:

1. Use the current production PWA and record the main SHA and date.
2. Capture primary authenticated screens at approximately 390–430 px width.
3. Never show the device key, a key entry in progress, Script Properties, URLs containing sensitive data, private transaction detail not needed for layout, or developer-console secrets.
4. Redact sensitive transaction descriptions and live balances if the image may be shared beyond the private project.
5. Capture both Accounts states and the installed standalone PWA separately.
6. Do not use screenshots to infer formula status or editability; use `03_Google_Sheet_Data_Model.md` and current server code.
7. Replace a screenshot reference when the corresponding production UI materially changes; do not silently keep stale visuals.
