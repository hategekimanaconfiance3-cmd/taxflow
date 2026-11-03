# TaxFlow Sales Invoice Production Release Validation

**Status: validation is incomplete; do not release yet.** This report records the validation performed on 2026-10-31. No commit, push, deployment, or production migration was performed.

## Checkout and scope

- Branch: `codex/release-production-materials`
- HEAD: `4e03b2243d41a8ad971a8b36b5eccdb8eb966932`
- Configured remote: `origin` → `https://github.com/hategekimanaconfiance3-cmd/taxflow.git`
- Latest fetched `origin/main`: `4e03b2243d41a8ad971a8b36b5eccdb8eb966932`
- Relationship: `origin/main...HEAD` is `0 0`; the invoice implementation is uncommitted work in the checkout.
- The reviewed work is limited to the sales-invoice feature and this release report. No unrelated payments-page edit is included.

## Runtime and test-runner failure

The machine's system Node is `v24.21.0` (the bundled runtime was `v24.22.1`). On Windows, `os.userInfo()` fails with `ERR_SYSTEM_ERROR: uv_os_get_passwd returned ENOMEM`. The operating system reported roughly 2.2 GiB free of 8 GiB, so the message did not correspond to actual memory exhaustion. The installed `tsx@4.21.0` test runner invokes `os.userInfo()` to determine its temporary directory before it starts tests. Node 20/22 were not installed, so a compatible alternative runtime could not be exercised.

For test execution only, a temporary `NODE_OPTIONS=--require` shim supplied a local username to the runner's `os.userInfo()` call. It was kept outside the repository and did not change application or test source. This confirms the test results under Node 24 with the runner workaround; it does not repair the underlying environment identity lookup. Do not change application code to mask that environment failure.

## Validation results

| Check | Result | Details |
|---|---|---|
| Focused invoice and payment regressions | Passed | 13 passed, 0 failed, 0 skipped: `tests/sales-invoice.test.ts`, `tests/payment-engine-domain.test.ts`, `tests/payment-idempotency.test.ts`. |
| Expanded transaction regressions | Passed with one opt-in skip | 16 passed, 0 failed, 1 skipped; the skipped test is the PostgreSQL B2B test when its opt-in flag is not set. |
| B2B PostgreSQL regression | Passed | Re-run separately with its disposable-database opt-in: 1 passed, 0 failed. |
| Migration 0028, clean install | Passed | Full migration journal applied to a new disposable local PostgreSQL 18 database. |
| Migration 0028, upgrade path | Passed | Applied the supported prior chain through 0027, then 0028 in a separate disposable database; invoice tables appeared and migration tracking contained the expected 29 entries. |
| Migration repeatability | Passed | Full migrator was rerun successfully; direct rerun of `0028_sales_invoices.sql` with `psql -v ON_ERROR_STOP=1` also completed with expected `IF NOT EXISTS` notices. |
| Invoice DB constraints and rollback | Passed | Unique invoice number and one-invoice-per-transaction constraints rejected duplicates; immutable snapshot trigger rejected update/delete; transaction rollback removed inserted test data. |
| Changed-file ESLint | Failed on a confirmed baseline issue | `components/dashboard/record-sale/record-sale-form.tsx:88` reports `react-hooks/set-state-in-effect`. Linting the same file from the base revision reports the same error. No lint error was reported in the new invoice implementation files. |
| Full TypeScript check | Failed, unchanged from base | 156 diagnostics on the working tree and 156 on a clean tracked snapshot of HEAD; normalized diagnostic comparison had delta 0. No invoice feature diagnostics were introduced. |
| Production build | Passed | `next build` completed successfully. Next reported that it skips TypeScript validation; the independent typecheck above remains failing. Build emitted existing Better Auth configuration warnings because `BETTER_AUTH_SECRET` and a valid base URL were not supplied in this local environment. |
| `git diff --check` | Passed | No whitespace errors. |
| Browser QA | Not run | No authenticated browser session for the local build was available during this validation. |

### Disposable database targets

Only these local PostgreSQL 18 databases were used; no production connection or data was used:

- `127.0.0.1:55438/taxflow_invoice_disposable`
- `127.0.0.1:55438/taxflow_invoice_upgrade_disposable`

The temporary cluster was created under the operating system temp directory. No production migrations were run.

## Invoice behavior reviewed

- The invoice service creates a final invoice only for completed/confirmed transactions. Pending or rejected B2B transactions do not get a final invoice.
- Retail completion and B2B buyer confirmation invoke invoice creation inside the existing transaction lifecycle. A unique transaction constraint and idempotent lookup protect against duplicate issuance.
- Invoice content is a snapshot of the completed transaction and its line items, including recorded VAT; the invoice is not recalculated from current product data.
- Access is restricted to the seller or identified buyer, with server-side checks on invoice and PDF retrieval.
- The PDF is a TaxFlow transaction invoice and does not claim to be an RRA/EBM fiscal invoice. Invoice creation does not imply payment.
- Email delivery is attempted only for eligible verified buyer emails. The UI reflects provider acceptance/status and does not claim confirmed delivery. A delivery webhook is not implemented.
- Duplicate email retries are controlled by the existing delivery state and provider idempotency key.

## Files in the reviewed release diff

Application, schema, migration, and tests (21 files):

1. `app/(dashboard)/dashboard/sales/page.tsx`
2. `app/(dashboard)/dashboard/transactions/page.tsx`
3. `app/(dashboard)/dashboard/invoices/[invoiceId]/page.tsx`
4. `app/api/sales-invoices/[invoiceId]/pdf/route.ts`
5. `components/dashboard/confirm-actions/confirm-actions.tsx`
6. `components/dashboard/dashboard-layout-client.tsx`
7. `components/dashboard/pending-page/pending-page-client.tsx`
8. `components/dashboard/record-sale/record-sale-form.tsx`
9. `components/dashboard/sales-invoice/sales-invoice-actions.tsx`
10. `db/migrations/taxflow/0028_sales_invoices.sql`
11. `db/migrations/taxflow/meta/_journal.json`
12. `db/schema.ts`
13. `lib/actions/sales-invoice.action.ts`
14. `lib/actions/transaction.action.ts`
15. `lib/sales-invoice-access.ts`
16. `lib/sales-invoice-delivery.ts`
17. `lib/sales-invoice-pdf.ts`
18. `lib/sales-invoice-service.ts`
19. `lib/sales-invoice-types.ts`
20. `tests/sales-invoice.test.ts`
21. `taxflow-sales-invoice-implementation-report.md`

This release report is the 22nd intended file. The migration journal records migration 0028 after the supported preceding chain.

## Limitations and release blockers

1. Full TypeScript validation still fails with 156 pre-existing diagnostics across the repository. The clean-base comparison confirms no diagnostic delta, but the repository-wide gate has not passed.
2. Changed-file lint still fails because the pre-existing sales form hook lint issue remains. It is identical on the base revision and was not changed as an unrelated cleanup.
3. Browser QA was not performed.
4. Email delivery has no provider delivery webhook, so downstream delivery cannot be confirmed from TaxFlow.
5. The local build emitted Better Auth environment warnings. Production environment configuration must be verified through the normal release process.

## Proposed release

After explicit approval and after addressing or accepting the listed release gates, the intended destination is a normal fast-forward push to `origin/main` (never force-push). Suggested commit message: `Add TaxFlow sales invoice lifecycle`. There is no commit or push in this report, and no deployment or production migration has occurred.
