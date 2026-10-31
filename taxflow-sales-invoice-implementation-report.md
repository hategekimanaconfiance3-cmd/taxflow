# TaxFlow Sales Invoice Implementation Report

## Existing architecture inspected

- Retail sales complete in `createRetailSale`; their stock and VAT effects are already committed transactionally.
- B2B transactions become invoice-eligible only after the existing buyer confirmation updates the transaction to `confirmed`. Dispatch and receipt remain separate workflows.
- TaxFlow uses integer RWF transaction and VAT amounts. This invoice snapshots those recorded amounts and does not recalculate VAT.
- Existing PDF libraries are jsPDF and jspdf-autotable. Resend is the existing email provider. No generic email queue or verified retail-customer email flow was present.
- The existing customer directory stores business-entered email addresses without a verification flag. The implementation therefore does not email those addresses. It attempts automatic sending only to an active, approved, email-verified buyer account.

## Implementation

- Migration `0028_sales_invoices.sql` adds an immutable invoice snapshot, unique invoice number sequence, one-invoice-per-transaction constraint, seller/buyer indexes, separate email-delivery status, and an update/delete rejection trigger.
- Invoice creation occurs inside the existing retail-sale or B2B-confirmation transaction. Invoice numbering is server-side and sequence-backed. Duplicate invoice creation is prevented by the transaction uniqueness constraint.
- Seller and buyer access is restricted to the exact transaction parties. The page and PDF endpoint require an authenticated session; PDF responses are private and non-cacheable. Invoice access and email attempts are audited.
- Seller sales history and both parties' transaction history link to issued invoices. Retail completion and B2B acceptance expose an immediate view link.
- The PDF and print view use the stored invoice snapshot. They show transaction VAT rate and amount where available, distinguish the TaxFlow Sales Invoice from an RRA/EBM fiscal invoice, and state that invoice generation is not proof of payment.
- Email status distinguishes provider acceptance from confirmed delivery. Failed delivery preserves the invoice and permits seller retry. No provider delivery webhook is configured, so the application does not claim delivery.

## Files changed

- `app/(dashboard)/dashboard/invoices/[invoiceId]/page.tsx`
- `app/(dashboard)/dashboard/sales/page.tsx`
- `app/(dashboard)/dashboard/transactions/page.tsx`
- `app/api/sales-invoices/[invoiceId]/pdf/route.ts`
- `components/dashboard/confirm-actions/confirm-actions.tsx`
- `components/dashboard/dashboard-layout-client.tsx`
- `components/dashboard/pending-page/pending-page-client.tsx`
- `components/dashboard/record-sale/record-sale-form.tsx`
- `components/dashboard/sales-invoice/sales-invoice-actions.tsx`
- `db/migrations/taxflow/0028_sales_invoices.sql`
- `db/migrations/taxflow/meta/_journal.json`
- `db/schema.ts`
- `lib/actions/sales-invoice.action.ts`
- `lib/actions/transaction.action.ts`
- `lib/sales-invoice-access.ts`
- `lib/sales-invoice-delivery.ts`
- `lib/sales-invoice-pdf.ts`
- `lib/sales-invoice-service.ts`
- `lib/sales-invoice-types.ts`
- `tests/sales-invoice.test.ts`

## Validation results

- Changed/new invoice-file ESLint command: passed with no output.
- `git diff --check`: passed.
- Production build (`node .\\node_modules\\next\\dist\\bin\\next build`): passed after the final VAT-rate/PDF updates. The build emitted missing-auth-secret/base-URL warnings and skipped Next's type validation.
- Changed-file ESLint: invoice modules and related views passed; the complete changed-file command reports one pre-existing `react-hooks/set-state-in-effect` error in `components/dashboard/record-sale/record-sale-form.tsx`. The flagged effect is present unchanged in the base revision; the unused-import warning in that file was removed.
- Full TypeScript check: failed with 156 repository diagnostics. Zero diagnostics reference any changed file. The failures are in unrelated existing repository modules.
- Focused test command (`node_modules\\.bin\\tsx.cmd --test tests\\sales-invoice.test.ts`): did not start; Node 24.21.0 failed in `os.userInfo()` with `uv_os_get_passwd returned ENOMEM`. No tests are claimed as passed.
- Database migration / PostgreSQL integration tests: not run. No disposable PostgreSQL test URL or `psql` executable was available in this checkout. No production database was used.
- Migration journal JSON parse: passed. This validates journal syntax only, not migration execution or database behavior.
- Browser QA: not run; no browser session was available for the local app.

## Remaining limitations and release blockers

- Migration 0028 must be reviewed and validated on disposable PostgreSQL databases for clean install and upgrade before production release.
- Retail/one-time customers have no verified email channel in the current workflow; their invoice remains available in TaxFlow, but automatic email is marked unavailable.
- Resend acceptance is tracked as `sent`; delivered status is not supported without provider delivery callbacks.
- Seller/buyer address and contact details are omitted because a verified, authorized source was not available in the existing invoice path.
- The document is a TaxFlow sales invoice, not an RRA/EBM fiscal invoice.
- No commit, push, deployment, or production migration was performed.
