# Product Journey Tree

## Access and route

The RRA-only view is available at `/admin/product-journey`. The server page calls `requireRRASession` before reading product, production batch, import, transaction, or stock-movement records. The sidebar item is restricted to compliance, audit, and stock officers; super admins are granted access by the existing guard.

## Current traceability sources

- `product`: product identity and unit.
- `production_batch`: declared manufacturer output and batch reference.
- `import_declaration`: importer declaration and inspected quantity when recorded.
- `transaction`: recorded seller/buyer, quantity, status, price, VAT and timestamp.
- `stock_movement`: signed quantity delta, before/after balances, source type and source ID.

The page displays these as three evidence columns (origins, transactions, inventory movements). This is a product-level evidence view, not a proven batch-allocation graph. Existing transaction rows do not currently carry a direct production-batch allocation, so the page must not infer which batch supplied a sale. Legacy stock balances without movement records have unknown provenance.

## Reconciliation

`reconcileStockMovements` checks the arithmetic invariant:

`quantityBefore + quantityDelta = quantityAfter`

A mismatch is a data-quality flag only. It is not a fraud determination and does not establish physical stock. Unit conversions, partial deliveries, returns, approved losses, delayed synchronization, and batch allocations need explicit linked records before a complete balance can be claimed.

## Security and privacy

- Page access is checked server-side against an active RRA staff record.
- Do not expose this page through merchant routes or reuse its data query for merchant clients.
- Add an audited access event before exposing more sensitive evidence or bulk exports.
- Any future traceability API and AI tool must call the same server-side authorization and filtering layer.

## Validation and deployment

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` in the repository environment. Verify against a staging database with synthetic data before deployment. Do not run seeds or migrations against production without an approved backup and migration plan.

## Remaining gaps

1. Explicit immutable batch-allocation records linking source batches/imports to outgoing movements and transaction line items.
2. First-class dispatch and receipt confirmations, partial deliveries, returns and transfer reconciliation.
3. Evidence links, correction/dispute history, and sensitive-access auditing.
4. Date/TIN/status filters, underlying record detail links, and AI traceability queries using deterministic server results.
5. Staging integration tests covering role restrictions and end-to-end branching journeys.
