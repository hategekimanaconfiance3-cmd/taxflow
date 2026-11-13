# Production report materials table implementation report

## Existing workflow audit

The manufacturer Production page already combines a legacy product/quantity/price form with recipe versions, reserved material plans, confidential material data, held production batches, and an authorized material-review/release queue. Recipe-backed declarations persist planned and actual usage separately and remain held; only the existing reviewer release flow posts actual material consumption and independently verified good finished-goods output. The non-recipe path remains necessary for products that have no recipe and uses the existing stock movement and audit transaction.

## Changes

- The production entry now presents required recipe materials in a compact table with immutable material/unit labels, read-only calculated planned quantities, editable actual consumption and waste, calculated difference, and approved-standard review status.
- Recipe-backed output continues to record total, good, and rejected quantities; production notes are captured with the batch. Zero actual use requires an explanation.
- Planned quantity, difference, and tolerance calculations use six-decimal integer-micro arithmetic aligned with the material ledger. Server validation rejects quantities beyond six decimal places.
- The server rejects the legacy non-recipe submission path when the manufacturer's product already has a recipe, closing the path that could otherwise bypass recipe material accounting. Products without recipes keep the legacy workflow.
- Idempotent replay now checks notes along with the existing submission data.
- No schema changes or migrations were needed: the current batch schema already stores notes and the current batch/usage records already preserve recipe, output, and material reporting.

## Security and accounting boundaries

The existing manufacturer session, product ownership checks, recipe/plan matching, server-derived plan quantities, held-batch status, and independent reviewer release remain authoritative. The client does not post stock or material movements. Required recipe lines cannot be removed or renamed in this workflow. Extra-material entries are not supported by the current recipe usage schema and are not accepted as arbitrary report lines. Production date and shift inputs are not present in the supported production model, so this implementation does not invent them.

## Validation

- Release validation was performed in an isolated worktree based on `origin/main` at `5917dd6` (`codex/release-production-materials`).
- Focused production/material accounting tests: **passed, 21 tests** (`node --import tsx --test tests/production-schema.test.ts tests/production-history-baseline.test.ts tests/production-confidentiality.test.ts tests/material-accounting.test.ts`). The existing fractional expectation was updated to the implemented six-decimal fixed-point result.
- Changed-file ESLint: **passed** for the production form, API, validation, service, confidentiality helper, and both production test files.
- Production build: **passed** with localhost-only placeholder configuration. Next.js 16.2.1 compiled and generated all 108 static pages; it explicitly skipped TypeScript validation.
- Full TypeScript check: **failed with 156 diagnostics**. A filtered check found **0 diagnostics in changed TypeScript files**. The previously reported repository baseline was 152 diagnostics; this run is four higher on the latest `origin/main` base. The reported diagnostics are in files outside this feature, but an untouched-main rerun was not performed to attribute the four-count difference conclusively.
- PostgreSQL tests: **1 migration-journal check passed; 2 database-backed tests skipped** because no `TEST_DATABASE_URL` with disposable-database guard and `PRODUCTION_MATERIAL_ACCOUNTING_TEST_DATABASE_DISPOSABLE=1` opt-in is configured. No PostgreSQL database was contacted and no migration was applied.
- `git diff --check`: **passed**.
- Browser QA: **not run**; the isolated worktree has no authenticated manufacturer browser session or disposable local database. Production browser testing was not used.

## Remaining limitations

- Browser QA requires an authenticated manufacturer session and was not run by static checks.
- The production materials reporting patch requires the already-present `0023_manufacturing_material_accounting.sql`, `0024_production_history_comparisons.sql`, and `0025_manufacturing_governance_accountability.sql` migration chain. Migration `0033_finished_goods_lifecycle.sql` is not required by this patch and was deliberately excluded with its finished-goods-lifecycle commit.
- The latest live production schema could not be confirmed from this environment: a read-only metadata connection timed out. Confirm those three migrations in production before approving release; do not infer live schema state from the branch or the timed-out query.
- Additional non-recipe material consumption needs a separately modeled, authorized, auditable entry type before it can be supported.
- Production date and shift need approved schema/business semantics before they can be collected.
- No migration was added or applied; the existing migration state is unchanged.
