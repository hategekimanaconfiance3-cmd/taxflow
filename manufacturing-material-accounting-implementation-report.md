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

Migration and validation used only the local disposable PostgreSQL database `taxflow_manufacturing_test`. No production credentials or data were used. No deployment, commit, or push was performed. Do not create historical material balances or movements for legacy batches; opening balances must be entered with evidence and independent review.

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

- Existing-database upgrade: bootstrapped the empty disposable database to the supported pre-0023 schema, then ran `drizzle-kit migrate`; the migration chain completed and recorded the four journal entries through 0023. Re-running migrate succeeded without adding entries.
- PostgreSQL integration test `tests/manufacturing-material-accounting-postgres.test.ts`: **passed** against the disposable database. It reapplies 0023 twice in a transaction, checks precision, constraints, indexes, foreign keys, immutable triggers and unchanged product/stock/transaction row counts, then verifies rollback.
- Fixed-point unit tests `tests/material-accounting.test.ts`: **passed**. Corrected an invalid rounding fixture: one-third of one micro-unit rounds to zero; the half-up boundary is one-half micro-unit.
- Focused ESLint across the material service, relevant production/RRA routes and both tests: **passed with no output**.
- Clean migration-chain attempt against a separate disposable empty database: **failed** after beginning the first migration. The journal starts at 0019 and does not contain the earlier schema migrations; therefore the repository's migration chain alone is not a clean-database bootstrap. No production database was involved. The failure's precise SQL statement was not recovered from the CLI output, so it must not be characterized more specifically.
- A full TypeScript check previously reported 156 diagnostics across unrelated admin analytics/API, messaging, AI, and language files. A filtered rerun found no diagnostics in the manufacturing service/routes/tests. This is not a clean repository typecheck.
- Production build compiled the app but failed during static page generation at `/admin-login` because `.env.local` contains the redacted `[SENSITIVE]` Better Auth URL placeholder. Next skipped type validation. No deployment was run.
- `git diff --check`: **passed** (line-ending normalization warnings only).

### Not validated / production blockers

- A clean-install procedure is still a blocker: the checked-in migration journal starts at 0019. Establish and document the supported baseline/bootstrap procedure, then test a clean database through that procedure before production approval.
- The PostgreSQL test verifies migration schema/idempotency/rollback behavior, but does not exercise end-to-end service actions for import/receipt quantities, independent approvals, opening-balance evidence, held/released batch inventory, rollback midway through release, concurrent releases, duplicate retries, corrections, company isolation, or permission denials. Add database-backed lifecycle/API tests for these requirements.
- Review found role checks on the new route handlers and no other imports of the mutation functions outside the routes. It did not prove role denial for every route through authenticated integration tests. Confidentiality was inspected in the relevant server queries, not tested end-to-end across logs/exports/ordinary product views.
- VAT timing remains a separate unresolved policy review. This validation made no tax-policy change and does not establish legal correctness.
- Historical stock/batch data was not modified, fabricated, or backfilled. No production migration, deployment, commit, or push was performed.

This work is **not production-ready** until the clean-install bootstrap is validated, lifecycle/concurrency and authorization/confidentiality database-backed tests pass, relevant VAT/retail/B2B/inventory regression tests pass, and repository-level TypeScript/build failures are resolved or isolated. Existing exact-unit matching remains intentionally strict: values must match after trim/case normalization and incompatible units are rejected; no conversions are guessed. VAT timing remains unresolved policy review; existing VAT behavior was preserved and no tax treatment was invented.
