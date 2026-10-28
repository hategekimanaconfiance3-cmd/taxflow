# TaxFlow Stock Sell-Through and Restock Control

## Scope and decision

This implementation adds a configurable sell-through eligibility check for **new restock requests only**. The selected gate does not change production entry, imports, or accepted B2B receipts. It does not place a supplier order or create an inventory receipt.

An eligible result means the request satisfies the configured TaxFlow threshold. A blocked or review-required result records why the automated calculation did not permit it. An exception approval records an officer's decision about that request only; it does not waive or rewrite the calculation, post stock, or post VAT.

## Existing model inspected

- `db/schema.ts` stores stock as an aggregate `(business_id, product_id)` balance and keeps an append-only `stock_movement` ledger with before/after quantities, movement type, source, actor, and timestamp.
- Retail sale inventory postings and B2B reservation/confirmation logic are in `lib/actions/transaction.action.ts`. Production stock receipts are in `lib/production-service.ts`; import receipts are in `lib/actions/import.action.ts`; accepted B2B receipt postings are in `lib/actions/b2b-fulfillment.action.ts`.
- Opening balances and legacy movements do not always provide a verified, complete sell-through cohort. The feature therefore does not infer provenance for them.
- Authorization uses the existing server-side guards in `lib/auth-guard.ts` and the role/permission registry in `lib/rra-rbac.ts`.

## Implemented

- Added `stock_sell_through_threshold`, `stock_sell_through_cycle`, and `stock_restock_request` tables in `db/schema.ts`, with migration `db/migrations/taxflow/0019_stock_sell_through_requests.sql`.
- Threshold revisions are append-only and effective-dated. Resolution order is product, category, then system default; within a scope, the latest effective revision wins. There is deliberately no assumed 75% default. Until a threshold is effective, requests require officer review.
- Added a deterministic calculation in `lib/stock-sell-through.ts`. It counts recorded `sale` and `retail_sale` movements with transaction provenance, and buyer-accepted B2B sales once. Reservations are not treated as sales. Supported inbound production, import, and accepted B2B receipts enlarge the cohort denominator.
- The calculation fails closed to officer review for an unattested legacy baseline, missing threshold, unresolved reservation, truncated evidence window, broken stock ledger, or unsupported movement type. Returns, losses, transfers, reversals, and corrections are not silently called sales.
- Added Zod validation and transactional server actions in `lib/validation/stock-sell-through.schema.ts` and `lib/actions/stock-sell-through.action.ts`. The trader's business is derived from the authenticated user; the submitted form cannot choose a business ID. Requests are idempotent and audited.
- The cohort timestamp is captured only after the stock row is locked, so a transaction that commits while the request waits is included in the locked baseline rather than double-counted as a later movement. Baseline attestation follows the same lock/time ordering and fails when no stock row exists.
- Threshold changes, exception decisions, and baseline attestations use distinct server permissions and write audit records in the same transaction. An officer cannot review their own exception request.
- Added the trader request page at `app/(dashboard)/dashboard/restock/page.tsx`, admin review/configuration at `app/(admin)/admin/stock-control/page.tsx`, and forms at `components/stock-control/forms.tsx`.
- Added a permission-filtered global search action in `lib/actions/admin-global-search.action.ts`. It returns each result group only when the current RRA staff roles have that group's permission, preserving the Super Admin denial for taxpayer intelligence search. Fixed the supply-chain stale-pending aggregate result handling.
- Added `stock_control_admin` with scoped threshold management, restock review, exception review, and recorded-balance attestation. System-default threshold management remains Super Admin only. This role does not grant taxpayer intelligence search or existing stock correction permissions. The existing explicit Super Admin denial for `taxpayer.intelligence.search` remains tested.
- The UI explains that eligibility and exception review do not make a purchase order, receive goods, change stock, or finalize tax.

## Calculation and data limitations

The initial cohort starts from the current recorded balance. If that balance is positive or has historical movement, the cohort requires an authorized officer's prospective baseline attestation. This attests the current TaxFlow balance as a calculation boundary; it does **not** independently verify physical inventory or repair old records.

Only supported movement types with source evidence are included. If more than 500 evidence rows are needed, or there are unsupported movements or unresolved reservations, automatic eligibility is withheld. Partial B2B dispatch and receipt semantics are not used to alter VAT. Existing VAT posting behavior remains untouched.

## Validation performed

- Focused AI, stock, RBAC, and navigation tests: **62 passed, 0 failed, 1 skipped**. The skipped test requires a disposable PostgreSQL database.
- Full Node test suite on the isolated release checkout: **102 passed, 0 failed, 4 skipped**. The skipped tests are opt-in PostgreSQL/payment/audit database tests; none were skipped to hide a failure.
- `drizzle-kit check --config drizzle.taxflow.config.ts`: **passed** with the new 0019 journal entry.
- ESLint on the touched feature files: **0 errors** and 3 unused-icon warnings in the existing sidebar modules.
- A clean `origin/main`-based typecheck reports **146 pre-existing dashboard/analytics type errors**; none are in the stock-control or AI files changed for this task. The existing Next.js build configuration skips type validation.
- `next build` completed in about 100 seconds on the source worktree containing this feature plus separate uncommitted dashboard work; it is not a clean-release build. It reported a dynamic file-tracing warning for invoice handling and local warnings for missing Better Auth production environment values. A clean release-worktree build could not run because Turbopack rejects the temporary external `node_modules` junction used for validation; this is an environment limitation, not a source compilation result for that checkout.

## Migration handling and production verification

- Migration 0019 is registered in `db/migrations/taxflow/meta/_journal.json`. The journal records **only 0019**; it does not invent Drizzle history for the handwritten/legacy 0000–0018 SQL files that have no checked-in journal entries.
- The migration now follows Drizzle's transaction convention: no SQL-level `BEGIN`/`COMMIT`, with statement breakpoints between PostgreSQL statements. Its named checks and unique indexes match `db/schema.ts`, without duplicate inline/table checks.
- The PostgreSQL integration test runs the migration twice inside separate transactions and verifies the required checks, indexes, immutable-history trigger/function, rollback behavior, and concurrent idempotency.
- No disposable PostgreSQL server/client is installed, and the configured `DATABASE_URL` points to local `localhost` and refused the read-only connection. There is no linked Vercel project or local Vercel CLI in this checkout. I did not run the migration, touch production data, or push/deploy.
- Before deployment, an authorized operator must read-only verify the production database identity, the `public.drizzle_migrations` watermark, and whether any of the three 0019 relations or related trigger/function already exist. If any relation exists with an incomplete or different definition, stop and reconcile it before applying 0019. Apply only after that preflight, then run the PostgreSQL integration checks against a disposable database with migrations 0001–0018 already applied.

## Remaining work before enabling in a live environment

1. Provide the authorized Neon production connection/deployment access so the read-only migration preflight can be completed. Do not push to the production branch before it passes.
2. Run the migration test on a disposable PostgreSQL database; the integration test is present but was skipped here because no server is available.
3. Resolve the existing dashboard/analytics TypeScript errors if the production release gate requires a clean `tsc --noEmit`; they are outside this stock/AI change and were not bundled into the release.
4. Have the authorized policy owner set and approve the initial threshold values and any scope-specific policy. This feature intentionally supplies no default percentage.
5. Decide separately whether TaxFlow should later add purchase-order creation and fulfillment to these eligibility records. That workflow is not implemented here.
6. Review timezone handling for administrators scheduling future threshold effective dates before relying on scheduled revisions across regions.

## Result

The implementation provides a fail-closed, auditable eligibility and exception-review foundation. It preserves existing stock receipt and VAT workflows and does not claim that recorded balances prove physical stock or that an approved eligibility request has been fulfilled. The local code and migration are prepared, but production rollout remains blocked until the actual Neon migration state is verified.
