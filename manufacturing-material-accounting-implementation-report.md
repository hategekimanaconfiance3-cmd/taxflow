# Manufacturing Material Accounting — Implementation Report

## Implemented

- Added a separate confidential material ledger with fixed-point quantities, import/domestic/opening-balance receipt evidence, immutable movements, planned material lines, and review state in migration `0023_manufacturing_material_accounting.sql`.
- Linked import declarations to a confidential material where selected. RRA activation records inspected quantities; material-linked imports post to the material ledger instead of ordinary product stock.
- Added domestic receipt claims based on confirmed incoming transactions and existing buyer-acceptance evidence. Claims require independent review before entering available material balance.
- Added manufacturer receipt and plan interfaces, plus a role-gated RRA receipt/batch review queue. The RRA view uses protected material codes and quantities, not confidential names.
- Recipe-backed production submissions are recorded as held. They do not deduct material or add available finished stock until an authorized reviewer releases them. Release locks material records, checks balances, writes immutable material movements and finished-stock movement atomically, and audits the decision. Non-recipe production preserves its prior posting path.
- Added dedicated permissions for receipt review, batch release, and evidence-backed stock adjustment. Super Admin does not gain these permissions by implication. The general disabled B2B receipt lifecycle was not enabled.
- Added focused fixed-point arithmetic tests.

## Migration and deployment

Migration: `db/migrations/taxflow/0023_manufacturing_material_accounting.sql`.

It has **not** been applied to any database, and no deployment, commit, or push was performed. Apply only to a disposable database for validation first. Production migration requires explicit authorization. Do not create historical material balances or material movements for legacy batches; opening balances must be entered with evidence and independent review.

## Validation actually performed

- Direct `tsc --noEmit` execution completed and reported existing project errors in unrelated analytics, messaging, and AI files. A filtered rerun showed no diagnostics in the new/changed manufacturing material files.
- `pnpm typecheck` could not start because Windows denied pnpm's shared store lock. An access request was declined; it was not retried.
- Focused lint passed with zero errors; it reported only the two pre-existing unused sidebar imports. Focused automated tests were not run because this checkout has no installed Vitest binary.
- Production build compiled the app but failed during static page generation because the local `.env.local` contains redacted `[SENSITIVE]` auth URL placeholders. This is an environment/configuration failure; no Vercel build or deployment was run.

## Remaining limitations

- Database-backed concurrency, rollback, permissions, receipt evidence, and migration behavior still need verification against a disposable PostgreSQL database.
- Domestic evidence currently requires transaction/product units to match the material unit exactly after case/whitespace normalization; conversion mappings are not implemented.
- This implementation does not assert the legal correctness of existing VAT timing. Existing VAT behavior is preserved; held recipe batches defer stock availability but do not create tax records in the review/release path.
- Reviewer notifications use existing notification records; delivery/real-time behavior depends on existing notification infrastructure.
- Review/release requires `stock_control_admin`; receipt verification allows `stock_control_admin` and `customs_import_officer`, as explicitly scoped in RBAC.

## Phase 2 validation and remediation (2026-10-29)

### Findings and changes

- **Import-to-material association was not enforced by the receipt service.** A caller could submit an activated import declaration for a different material owned by the same manufacturer. The service now requires the declaration's `production_material_id` to equal the requested material for both submission and independent verification.
- **Import unit matching was missing at receipt submission/review.** The service now rejects imports unless the product unit and material unit match after trim/case normalization. No conversion is performed; values such as `liter` and `L` remain incompatible.
- **The migration was not rerunnable.** Its receipt and material-plan delete-protection triggers were created without dropping an existing trigger. The migration now drops those two triggers before recreating them. Other trigger definitions were already repeatable.
- **Zero actual usage could prevent a valid batch release.** Production evidence permits zero actual usage, while the immutable ledger correctly rejects zero movements. Release now retains the zero-usage evidence and omits only the zero-value movement.
- **Inactive sessions were not rejected by the production, material-accounting, or plan API guards.** These endpoints now return 403 for an authenticated inactive account. Role and RRA permission assignments were not broadened.
- Re-inspection found the material-aware import views return confidential names only for the owning trader; RRA import views use a generic label and protected material codes, with codes restricted by the existing receipt-review permission. Formula names are returned only by the endpoint guarded by `production.formula.read`. The Super Admin role still has none of the new receipt, batch-review, or adjustment permissions.
- The ordinary B2B receipt workflow remains unchanged and disabled as before. Recipe-backed batches remain held until review; releases remain transaction-scoped and lock the batch and sorted material rows before checking ledger balances and posting stock/material movements plus audit evidence.

### Checks actually run

- Focused ESLint on the changed production routes, material service, arithmetic helper, and new tests: **passed with no output**.
- Focused test command `& .\node_modules\.bin\tsx.cmd --test tests/material-accounting.test.ts tests/manufacturing-material-accounting-postgres.test.ts`: **could not start**. Node 24 failed inside tsx with `uv_os_get_passwd returned ENOMEM`; no test assertions ran.
- `& .\node_modules\.bin\tsc.cmd --noEmit`: **failed with 156 TypeScript diagnostic lines across the repository**. A filtered rerun showed no diagnostics in the changed manufacturing service/routes/test files. Reported errors include unrelated admin analytics/API, messaging, AI, and language files; this is not a clean project typecheck.
- `& .\node_modules\.bin\next.ps1 build`: compilation succeeded, but static generation failed at `/admin-login` because local `.env.local` contains the literal redacted Better Auth URL placeholder `[SENSITIVE]`. Next skipped type validation during this build.
- `git diff --check`: **passed** (Git printed only line-ending normalization warnings).
- No `TEST_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL` is present in this environment; `psql`, `postgres`, and `docker` are unavailable on `PATH`. The migration and database-backed test therefore were **not executed**. An opt-in disposable-PostgreSQL integration test was added to check rerun behavior, numeric precision, foreign keys, workflow constraints, immutable triggers, indexes, and unchanged product/stock/transaction row counts inside a rolled-back transaction.

### Not validated / production blockers

- No migration application against either a clean disposable installation or a disposable existing-database upgrade was possible. The migration's PostgreSQL syntax, actual catalog shape, rerun behavior, and tracking integration remain unverified in a live PostgreSQL engine.
- Receipt source matching/quantity ceilings, independent reviewer enforcement, ledger immutability, opening-balance evidence, insufficient-stock release rejection, all-or-nothing release rollback, concurrent release safety, duplicate retries, correction history, cross-company isolation, and permission-denial behavior still require database-backed service/API tests.
- VAT timing remains a separate unresolved policy review. This validation made no tax-policy change and does not establish legal correctness.
- Historical stock/batch data was not modified, fabricated, or backfilled. No production migration, deployment, commit, or push was performed.

This work is **not production-ready** until disposable PostgreSQL migration and lifecycle/concurrency tests, authorization/confidentiality regressions, and existing VAT/retail/B2B/inventory regression tests pass, and the repository-level TypeScript/build failures are resolved or isolated.
