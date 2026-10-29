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
