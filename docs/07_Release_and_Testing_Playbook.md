STATUS: CURRENT / AUTHORITATIVE
Last Updated: 2026-09-12

# Personal Finance PWA — Release and Testing Playbook

**Owner:** Glen Reyes  
**Source of Truth:** Current production workflow, current security rules, and risk-proportional engineering policy.  
**Related:** `04_Security_and_Architecture_Rules.md`

## Current production baseline

| Item | Current baseline |
| --- | --- |
| Application release SHA | `ca8f973226b2c0fa301326789c865d848006aa1f` |
| Production Apps Script | Version 37 |
| Current release | Philippines Wealth accounts |
| Full regression result | 261 / 261 passed |
| Immediate frontend rollback | `f6eeeac486a0e62340effbe7ce2b2b6340487485` via reviewed revert |
| Immediate backend rollback | Apps Script Version 36 |
| Production Web App | Existing deployment, URL unchanged |

Philippines release production validation passed: one live PHP-account source value was changed through the PWA, the Sheet CAD conversion and dependent totals recalculated, and the exact original native value was restored. No synthetic production value remains.

## Governing principle

Use the smallest process that can detect a realistic failure for the change being made.

Before adding a test, audit, deployment gate, or review, ask:

> What realistic untested failure would this detect?

If there is no clear answer, skip it.

## Risk levels

### LOW

Examples:

- copy;
- styling;
- layout;
- read-only UI;
- filters/charts;
- non-financial frontend behavior.

Workflow:

```text
inspect
→ implement
→ focused tests
→ visual check if useful
→ diff review
→ deploy/merge
→ sanity check
```

Do not create a test Apps Script deployment, rollback branch, broad security review, repeated SHA checks, or full browser regression unless the change justifies it.

### MODERATE

Examples:

- existing CRUD/cache/authenticated APIs;
- small extensions of a proven financial-write pattern where target type, mutation mechanism, and formula boundary are already understood.

Workflow:

```text
targeted inspect
→ implement
→ focused + relevant regression tests
→ diff review
→ small integration/smoke check if useful
→ ship
```

Do not re-certify proven architecture.

### HIGH

Examples:

- first financial-write mechanism;
- authentication change;
- new writable Sheet area;
- formula/dependency change;
- financial migration;
- a change capable of corrupting multiple records.

Workflow:

```text
inspect
→ implement
→ focused + regression tests
→ data/security review
→ synthetic integration if useful
→ explicit owner approval
→ one minimal reversible production validation
→ restore exact original value
→ verify authoritative state
→ ship/smoke
```

Avoid duplicate gates once the actual risk is covered.

## Standard development workflow

1. Fetch current `main` and confirm the relevant production baseline.
2. Create one focused feature branch for meaningful code changes.
3. Inspect only the files/functions/cells needed for the task.
4. Preserve unrelated work and avoid broad refactors.
5. Run focused tests first.
6. Run broader regressions only when shared infrastructure, auth, or financial writes changed.
7. Review the actual diff; do not accept agent output merely because tests pass.
8. Stop for owner approval only where production deployment/write risk requires it.

## Financial-write checklist

For a new or materially changed financial write boundary, verify:

- authenticated POST only;
- stable logical ID;
- exact server-side whitelist mapping;
- no client-directed Sheet topology;
- numeric validation;
- live identity validation where relevant;
- formula/source-cell protection;
- LockService around the critical section;
- authoritative Sheet recalculation;
- full fresh reread returned to the client;
- no optimistic Wealth state patching;
- meaningful negative-path tests.

## Formula and foreign-currency checks

When an editable native balance has a Sheet-driven converted/display value:

1. Write only the approved native input cell.
2. Treat the conversion formula cell as read-only.
3. Validate the required formula when the write depends on it.
4. Never accept an FX rate from the browser.
5. Never duplicate the conversion in frontend JavaScript.
6. Reread the converted value from Sheets after the write.

This pattern is currently proven for National Bank TFSA-USD and Philippines PHP accounts.

## First-write production validation

Use only when the write boundary is new or materially changed.

1. Record the exact original authoritative source value privately.
2. Make one minimal valid temporary change through the real app/API path.
3. Verify only the expected native source changed.
4. Verify protected formulas remain intact.
5. Verify dependent totals/converted values recalculate as expected.
6. Restore the exact original source value immediately.
7. Reread until the source is restored and formulas/dependencies are valid.
8. Confirm no synthetic value remains.

Do not repeat this full ceremony for every later account added to an already-proven pattern unless the target, formula relationship, security boundary, or mutation mechanism materially changes.

## Browser / UI review

Use visual review where the changed behavior can realistically fail visually.

For mobile finance UI, prioritize approximately 390–430 px widths and installed-PWA behavior.

Check only affected paths plus a small sanity check of shared navigation/state. Do not run a broad manual regression for an isolated low-risk change.

## Security review

For relevant changes, verify:

1. no secret/device key in source, prompts, screenshots, logs, fixtures, URLs, or service-worker cache;
2. financial GET remains denied;
3. invalid/missing key remains denied;
4. unknown action/ID remains denied;
5. browser cannot select Sheet/range/cell/formula;
6. formula cells remain protected;
7. LockService and authoritative reread remain intact;
8. financial API traffic is not cached by the service worker.

Do not repeat a broad security audit when none of these boundaries changed.

## Backend release sequence

For a meaningful Apps Script release:

1. Confirm reviewed source SHA.
2. Preserve the currently deployed immutable Apps Script version as rollback.
3. Push the reviewed Apps Script source.
4. Create one new immutable Apps Script version.
5. Update the **existing** production Web App deployment to that version.
6. Keep the production URL unchanged.
7. Perform only the read-only/smoke checks justified by the release.
8. Perform a live financial write only if explicitly approved and required by the risk level.

Do not create a second production Web App deployment without a specific reason.

## Frontend release sequence

1. Confirm the backend is compatible before publishing a frontend that depends on it.
2. Merge reviewed code into `main`.
3. Let the existing GitHub Pages workflow deploy.
4. Confirm the production assets correspond to the approved release.
5. Perform a focused production sanity check.

## Rollback

If a new production release fails:

- stop further writes;
- determine whether the problem is frontend, backend, data, or stale client state;
- reread authoritative Sheet state before corrective writes;
- backend rollback: point the existing Web App deployment to the last verified immutable Apps Script version;
- frontend rollback: use a reviewed revert commit; do not force-reset shared `main`;
- verify authenticated reads and the affected workflow after rollback.

For the Philippines release, immediate rollback points are Apps Script Version 36 and frontend SHA `f6eeeac486a0e62340effbe7ce2b2b6340487485`.

## Documentation-only changes

Documentation-only work does not require financial deployment gates.

Use:

```text
inspect current production facts
→ update only affected docs
→ review diff for contradictions/secrets
→ merge
```

Do not modify production Sheet values, formulas, Apps Script deployment, or application code as collateral work.

## Historical test records

| Release | Historical full-suite record |
| --- | ---: |
| Stage 6 Wealth read-only | 102 / 102 |
| Phase 2A initial Wealth editing | 141 / 141 |
| Phase 2B reserve management | 166 / 166 |
| Phase 2C National Bank editing | 194 / 194 |
| Philippines Wealth accounts | 261 / 261 |

Historical counts are release records, not a requirement that every future change increase or rerun the full suite.