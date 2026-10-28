# TaxFlow production formula confidentiality

## Architecture findings

The existing production workflow records a manufacturer's finished product, declared output, unit price, VAT snapshot, production batch, inventory increment, stock movement, and audit events in `lib/production-service.ts`. It has no material, recipe, planned-versus-actual input, or recipe approval model. Production history is exposed through manufacturer pages and summaries; RRA journey and taxpayer lookup show batch/product-level data. RRA access uses server-side role permissions in `lib/rra-rbac.ts` and `requireRRAPermission`. Audit events are stored in the existing `audit_log` table.

No manufacturer representative/membership model, approved-recipe workflow, or individual formula-access approval workflow exists. This implementation uses the existing manufacturer account as the business boundary and the existing specialist permission system; it does not invent membership or approval policy.

## Implementation

- Added separate manufacturer-scoped material, immutable recipe-version, recipe-line, and batch material-usage records. Existing batches are not backfilled with guessed formula data.
- Added a manufacturer-only recipe API and recipe management UI. Recipe reads and writes are filtered by the authenticated manufacturer; products must also belong to that manufacturer.
- Production submission now records planned finished output and actual finished output, plus actual material quantities for every line in the selected recipe version. Server-side validation compares output and material usage against the recipe and its manufacturer-configured review tolerance.
- Recipe versions, material identities, recipe lines, batch formula references, and batch usage evidence are protected by database triggers from update/delete. Corrections require a new recipe or production record.
- Added `production.formula.read` for `audit_investigation_officer` and legacy `audit_officer` roles only. `super_admin`, compliance, traceability, and other roles do not receive it. The protected RRA route checks permission server-side; case-purpose access additionally verifies assignment to the requesting staff record.
- The formula access route writes an audit event before returning names and quantities. Audit metadata contains access purpose, case reference, target IDs, and material count, never formula names or quantities. Denied case access is also audited.
- Standard RRA summaries expose only production status/validation status. They do not include material names, codes, quantities, recipe contents, or actual usage. Formula fields are returned only by the permission-guarded endpoint.
- Existing finished-goods stock, stock movement, transaction, and VAT calculations retain the existing actual-output quantity and VAT trigger. Recipe checks do not alter or post tax.

## Files and migration

The core changes are in `db/schema.ts`, `db/migrations/taxflow/0020_production_formula_confidentiality.sql`, `lib/production-service.ts`, `lib/production-confidentiality.ts`, `lib/validation/production.schema.ts`, and `lib/rra-rbac.ts`. The manufacturer interface/API is in `app/(dashboard)/dashboard/production/page.tsx`, `components/dashboard/production-form/production-form.tsx`, `components/dashboard/production-form/recipe-manager.tsx`, `components/dashboard/production-register/production-register.tsx`, `app/api/production/recipes/route.ts`, and `app/api/production/route.ts`. Restricted RRA evidence is in `app/api/admin/production/formula/route.ts` and `components/admin/product-journey-explorer.tsx`; non-confidential summaries are updated in `lib/actions/admin-tin-lookup.action.ts` and `components/admin/tin-taxpayer-lookup.tsx`.

Migration `0020_production_formula_confidentiality.sql` adds the four formula/evidence tables, batch reference/status columns, constraints, indexes, and immutability triggers. The Drizzle migration journal includes `0020`. The migration has not been applied to production or another live database.

## Validation and tests

Added focused tests in `tests/production-schema.test.ts` for recipe inputs, planned output requirements, unique material lines, and access purposes; `tests/production-confidentiality.test.ts` covers deterministic scaling and tolerance signals; `tests/rra-rbac.test.ts` asserts role boundaries and preserves the existing `super_admin` denial for `taxpayer.intelligence.search`; and `tests/production-confidentiality-postgres.test.ts` checks migration repeatability and database triggers on an explicitly opted-in disposable PostgreSQL database.

`git diff --check` completed successfully. The focused Node test command could not start in the sandbox because Node 24 returned `uv_os_get_passwd ENOMEM`. An outside-sandbox retry was requested and rejected, so no test pass is claimed. The PostgreSQL test was not run because no disposable test database was configured. Type checking and the Next.js build were not run for this change.

## Known limitations and policy boundaries

- Only the business's authenticated manufacturer account can manage or read its recipes; delegated manufacturer representatives are unsupported because the repository has no existing representative model.
- The authorized RRA route requires a dedicated role permission and a recorded purpose. Case-purpose access requires an assigned case. There is no separate approval queue for other purposes; add one only after its approval policy and authorized approvers are defined.
- Recipe content and tolerance are manufacturer-entered and not independently verified or RRA-approved. The threshold is an operational review signal, not a legal/tax rule, proof of wrongdoing, or proof that physical production occurred.
- Standard RRA users currently receive no material quantities because the repository has no policy defining which non-confidential quantities they may see. This should be separately approved before broadening the read model.
- There is no production recipe approval/version correction workflow, multi-batch statistical anomaly model, raw-material inventory ledger, or batch-to-downstream-stock allocation. Product journey still cannot prove which specific batch supplied downstream sales.
- Historical production records remain legacy records without fabricated recipe or material evidence. Export/email/notification paths do not currently expose these new fields; any future export must reuse the same server-side authorization boundary.
- Formula storage is protected by application authorization and append-only triggers. Database operators with direct privileged database access remain outside application-level field confidentiality; stronger separation would require a separate key/secret or database privilege design.

## Test and implementation outcome

The implementation is additive and keeps the existing stock and VAT posting path. Static whitespace validation passed. Automated test, typecheck, build, and live migration results remain unverified due to the execution restriction and absent disposable database. No production data, deployment, commit, or push was changed for this work.
