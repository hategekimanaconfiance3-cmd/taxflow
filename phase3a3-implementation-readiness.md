# TaxFlow Phase 3A.3 — Implementation Readiness and Workflow Validation

**Audit type:** Read-only implementation-readiness audit

**Repository snapshot:** `codex/central-taxpayer-workspace` at `c8f9e9f13dd4ee12b843d309b4fc822b0dd253cb`
**Scope:** B2B fulfillment evidence, retail sales, stock conservation, reconciliation, corrections, audit integrity, idempotency, authorization, tests, and migration readiness.

## 1. Executive summary

The core Phase 3A.1 findings remain accurate in the current checkout:

1. **B2B records do not separately capture dispatch and measured receipt.** The sale row stores the agreed quantity. Buyer confirmation transfers that full quantity into buyer stock.
2. **Historical reconciliation is not reproducible for past periods.** It calculates period activity but compares it with the current mutable `stock.quantity` snapshot.
3. **Transaction correction can commit before its required audit event.** `modifyTransaction` commits its transaction/VAT/stock writes and then calls `logAudit` separately.

The readiness audit additionally confirms a blocking partial-dispatch issue: reservation release currently restores the entire reserved quantity and requires reservation quantity to equal the full transaction quantity. It cannot safely handle a transaction after only part of its quantity has shipped. Expiry and trader cancellation operate on pending transactions; RRA cancellation of a confirmed transaction reverses the full transaction quantity. These paths need explicit partial-fulfillment rules before dispatch/receipt work begins.

Retail already has the desired no-customer-confirmation behavior: `createRetailSale` completes the sale, deducts stock, writes VAT, stock movement, and audit evidence in one database transaction. The new B2B evidence model should not change that flow or create a pending receipt task for a final customer.

**Recommendation:** begin implementation only after the business and tax-policy questions in section 10 are decided. The first implementation stage should be policy-approved state and quantity invariants plus service-level design, followed by additive schema work. Do not infer dispatch/receipt evidence for legacy sales or claim migration deployment from source files.

## 2. Repository and working-tree state

- Repository root: `C:/Users/PC/Downloads/taxflow/_support-ticket-workflow`
- Branch: `codex/central-taxpayer-workspace`
- HEAD: `c8f9e9f13dd4ee12b843d309b4fc822b0dd253cb` (`Fix RRA staff role assignment policies`)
- Working tree before this report: clean.
- This report is the only intended file change from this audit. No existing uncommitted application work was present to preserve.
- The production database was not queried. Migration files are evidence of intended schema changes, not proof they are deployed.
- PR status and remote deployment status were not checked as part of this read-only repository audit.

The project uses Next.js/TypeScript, Drizzle, PostgreSQL, and server actions. The local scripts include `test`, `typecheck`, `build`, and database migration/push/seed commands. No database write, migration, seed, deploy, commit, or push was run.

## 3. Verified current-state findings

### B2B sale creation and confirmation

`lib/actions/transaction.action.ts` validates seller/buyer eligibility, products, quantity, price, and tax arithmetic. It locks seller stock rows in product order and atomically creates a pending transaction per product, a full-quantity reservation, an available-stock decrement, an immutable stock movement, audit records, and a buyer notification. `transaction_item` exists but this path does not populate it; the workflow represents multi-product requests as multiple transaction rows. There is no sale idempotency key in the input or transaction schema.

On buyer confirmation, the action locks the transaction and reservation, converts the reservation, locks stock, credits the buyer with the full agreed quantity, records stock movements and VAT rows, marks the transaction confirmed, and writes audit/notification records within the transaction. No dispatch record, receipt quantity, condition, delivery evidence, or independently measured partial receipt is read or written.

References: [sale creation](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/transaction.action.ts:188>), [reservation conversion and confirmation](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/transaction.action.ts:409>), [transaction and reservation schema](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/db/schema.ts:261>).

### Retail sale

`createRetailSale` is restricted to retailers. It calculates configured VAT, locks and immediately decrements retailer stock, inserts a `completed` transaction with `buyerId = null`, records an output VAT row, a stock movement, and an audit record within one database transaction. There is no customer confirmation step. A saved customer reference is optional, although the current action requires a customer name when no saved customer is selected. The seller’s recorded transaction is not independent proof that the final customer physically received the goods.

Reference: [retail sale action](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/transaction.action.ts:745>).

### Reservations, expiry, returns, and cancellation

The reservation table allows one row per transaction, stores the complete reserved quantity, and constrains status to `active`, `converted`, `released`, `expired`, or `cancelled`. The release helper validates that reservation quantity equals transaction quantity, changes the reservation to terminal status, and restores the entire reservation quantity. This is correct only when no portion has been dispatched.

Stale reservations are expired lazily by queries/actions, not by an independent scheduler. The expiry path locks the transaction and reservation and invokes the same full-quantity release helper. Trader reject/cancel paths release active reservations for pending transactions. RRA cancellation of a confirmed/completed transaction reverses the full transaction quantity on seller/buyer stock and creates opposite VAT records. No partial-dispatch quantity is represented, so existing cancellation and expiry paths cannot safely be reused unchanged after partial dispatch.

References: [reservation helpers and expiry](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/transaction.action.ts:23>), [trader reject/cancel](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/transaction.action.ts:633>), [RRA cancellation](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/admin.action.ts:541>), [reservation migration](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/db/migrations/taxflow/0012_stock_reservations.sql:1>).

### Stock, production, and imports

`stock` is one mutable available-quantity snapshot per business/product. `stock_movement` is append-only when its trigger migration is installed; it records scalar before/after quantities and optional polymorphic `source_type`/`source_id` text, not bucket transfers or foreign-key-enforced source links. Legacy stock quantities may have no verified movement history.

Production recording inserts a batch, upserts stock, records a production movement, and writes audit records in one transaction. Production has an idempotency key, but its unique index is global on the key rather than scoped by manufacturer; application replay lookup is manufacturer-scoped. Import confirmation locks a submitted declaration, updates status, adds inspected quantity to stock, records a movement, and writes audit data in one transaction. Import evidence fields include references/descriptions, not verified attachment bytes in the reviewed schema.

References: [stock and movement schema](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/db/schema.ts:206>), [production action](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/production-service.ts:100>), [import action](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/import.action.ts:188>), [production migration](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/db/migrations/taxflow/0014_manufacturer_production_workflow.sql:56>).

### Corrections, disputes, VAT, and audit

`modifyTransaction` requires a reason and restricts status, but reads the transaction before its write transaction without locking it. It updates transaction and VAT rows in place, adjusts stock if matching rows exist, then writes `TRANSACTION_MODIFIED` after commit through a separate audit operation. Thus, an audit insert failure can leave the correction committed without its required audit evidence. Its input checks only compare quantity/price to zero; they do not establish all finite/integer/safe-range constraints needed for the calculated financial values. Stock reads in this correction path are not locked.

Dispute resolution locks the dispute and transaction, records stock/VAT effects, dispute outcome, notifications, and audit within a database transaction. RRA cancellation similarly uses transactional stock/VAT/audit updates. These are stronger patterns to reuse. Stock correction actions also write movements and audit within a database transaction; however their pre-edit state is read before acquiring the stock row lock, so audit snapshots should be reviewed for concurrency accuracy.

Audit-log and stock-movement immutability are defined in migrations `0003` and `0008`/`0014`. They do not form a cryptographic chain, and source references on stock movements are not enforced as foreign keys. VAT records are mutable in correction paths and are not a complete version history by themselves.

References: [transaction modification](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/admin.action.ts:309>), [dispute resolution](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/dispute.action.ts:550>), [stock correction](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/admin-stock-correction.action.ts:14>), [audit immutability migration](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/db/migrations/taxflow/0003_audit_log_immutable.sql:1>), [stock immutability migration](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/db/migrations/taxflow/0008_stock_ledger_tax_snapshots.sql:1>).

### Reconciliation

`reconcileInventory` sums period opening adjustments, confirmed/completed buyer/seller transactions by transaction creation time, period-contained production batches, and losses; it compares the result with current `stock.quantity`. It defaults absent stock/data to zero and catches errors by logging and returning `null`, making unavailable data and failed calculations hard to distinguish. The scan uses an unordered `.limit(500)`, and finding `evidenceRefs` hold only period dates. The dispatch-mismatch helper does not compare persisted dispatch/receipt facts and is not called by the reviewed reconciliation action. Pure supply-chain matching tests exercise a different function with explicit synthetic records.

References: [reconciliation service](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/ai/reconciliation.ts:37>), [finding scan/evidence refs](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/ai/reconciliation.ts:159>), [dispatch helper](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/ai/reconciliation.ts:299>), [scan action](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/actions/ai-finding.action.ts:217>), [pure reconciliation logic](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/intelligence/reconciliation.ts:32>).

## 4. B2B versus retail workflow comparison

| Dimension | B2B (manufacturer/wholesaler/retailer/institution) | Retail (retailer/final customer) |
| --- | --- | --- |
| Current behavior | Seller creates pending sale/reservation; buyer confirms the full agreed quantity; buyer stock and VAT are recorded. | Retailer creates a completed sale; retailer stock, output VAT, movement, and audit update atomically. |
| Required new evidence | Separate order acceptance if policy requires it; one or more seller dispatch records; one or more buyer-business receipt records; discrepancy and resolution records. | Seller-entered sale and existing transaction evidence; optional customer receipt/acknowledgment, never a completion prerequisite. |
| Confirmation actor | Buyer business account or an explicitly authorized representative for that business. A representative’s authority must be verifiable. | No customer confirmation. Seller’s authorized retailer user records the sale. |
| Quantity semantics | Agreed, reserved, dispatched, received, accepted, damaged/rejected, and unresolved quantities remain distinguishable. | Quantity sold is retailer-reported; do not label it independently verified physical delivery. |
| Completion | Fulfillment completes only after all dispatched quantities are received or explicitly resolved. Tax finalization timing requires authorized policy. | Completes at retailer submission under current rules; do not create a pending B2B receipt or customer task. |

The current buyer model resolves a TIN to a single `user` row. The reviewed schema/action does not show an organization membership or authorized-representative mapping. Supporting multiple purchasing-company representatives therefore requires an authorization decision and likely a membership/authority model; do not treat any user with a matching company name as authorized.

## 5. Stock and reservation invariants

### Required quantity invariant

For every transaction line, preserve:

`agreed quantity = unshipped reserved + in transit + accepted at buyer + damaged/rejected hold + explicitly resolved quantity`

The exact buckets and meaning of “resolved” require policy approval. Quantities must use consistent product units; no event may silently disappear, be applied twice, or make available stock negative. Every mutable snapshot update and its append-only event must commit together. Reservation release must be idempotent and limited to **unshipped** quantity.

### Conservation examples (units)

Assume the seller starts with 1,000 available units and agrees to sell 1,000.

1. **Complete B2B delivery:** Reserve 1,000: seller available 0, reserved 1,000. Dispatch 1,000: reserved 0, in transit 1,000. Buyer accepts receipt of 1,000: transit 0, buyer available 1,000. No second seller deduction occurs at dispatch.
2. **Partial dispatch:** Reserve 1,000, dispatch 600: seller available 0, undispatched reservation 400, in transit 600. If the remaining 400 is later cancelled, release only 400; the 600 remains in transit pending receipt/resolution.
3. **Partial receipt with damage:** Dispatch 1,000; buyer records 970 physically received: 950 accepted, 20 damaged, 30 short/unresolved. Result: buyer available +950; damaged hold 20; shortage/claim 30 remains explicitly unresolved. Total accounted quantity remains 1,000. Do not automatically finalize financial quantity or VAT until policy defines the disposition.
4. **Cancellation before dispatch:** Reserve 1,000 and dispatch 0. Cancel: release 1,000 to seller available; buyer stock remains unchanged; no receipt or VAT is fabricated.
5. **Cancellation/dispute after partial dispatch:** Dispatch 600 of 1,000; only 400 remains releasable to seller. The 600 dispatched units must be accounted for by receipt, return, loss/damage resolution, or an open in-transit exception. Reversal must use the approved disposition and actual available quantities; never restore all 1,000 to seller while also leaving buyer stock credited.

The current system has no in-transit snapshot/bucket. A future design can derive in-transit from dispatch less receipt/disposition records, but then reservations must expose remaining unshipped quantity and reconciliation must account for all terms consistently. A zero-delta `stock_movement` alone is not sufficient to represent movement between inventory buckets.

### Current path safety classification

| Path | Current safety for partial dispatch | Evidence |
| --- | --- | --- |
| Expiry | **Confirmed incompatible.** Only pending transactions are considered; release helper restores full reservation and requires reservation quantity = transaction quantity. | `transaction.action.ts` reservation helpers and expiry. |
| Trader cancel/reject | **Confirmed incompatible after dispatch.** Pending-only paths release the full active reservation; no dispatched amount exists. | `transaction.action.ts` reject/cancel. |
| RRA cancellation | **Confirmed incompatible without redesign.** Pending cancellation releases full reservation; confirmed/completed reversal reverses full transaction quantity. | `admin.action.ts` cancellation. |
| Dispute undo | **Confirmed not receipt-aware.** It reverses transaction quantity and requires buyer stock sufficient for that full amount. | `dispute.action.ts` `resolveDispute`. |
| Stock correction | **Requires integration design.** It adjusts current stock and movement/audit but has no link to open dispatch quantity or fulfillment allocation. | `admin-stock-correction.action.ts`. |
| Returns | No explicit B2B return lifecycle was established in the reviewed transaction workflow. Returns must not be represented as a silent quantity edit. | Schema/search reviewed; no B2B return action found. |

## 6. Historical reconciliation requirements

1. Define whether reconciliation is for **available stock**, total owned stock, or both. If both, report available, reserved, in-transit, accepted/held, and unresolved quantities separately.
2. Establish a cutover timestamp and capture an opening snapshot per business/product. Label it as an observed legacy balance with **unknown historical provenance** unless independently verified.
3. For periods after cutover, reconstruct period-end values from ordered, dated stock events and source records. Use deterministic timestamp and tie-breaking semantics; validate every event’s before/after chain against the prior event and opening snapshot.
4. Select activity by the event time relevant to the ledger (reservation, dispatch, receipt, production, import, correction), not only transaction creation time.
5. Include source record IDs, event types, quantities, actors, and unresolved links in the saved reconciliation evidence. Preserve the calculation/version and inputs so a result can be reproduced.
6. Replace `.limit(500)` with stable cursor pagination over all eligible business/product pairs and report scan completion/continuation rather than silently omitting rows.
7. Distinguish `incomplete evidence`, `calculation failure`, `missing opening balance`, and `measured discrepancy`; do not coerce missing data/errors to zero and call the result a discrepancy.
8. Do not create dispatch, receipt, or ledger entries for pre-cutover transactions based on agreed quantity. Earlier results must be marked incomplete/unverifiable; only evidence actually recorded at the time may be used.

## 7. Correction and audit integrity

| Current implementation | Proposed change | Reason and expected behavior | Verification |
| --- | --- | --- | --- |
| `modifyTransaction` updates transaction/VAT and stock in one transaction, then separately writes audit. | Validate inputs with a server-side Zod schema; lock transaction and affected stock rows in deterministic order; insert an immutable correction/version event and audit in the same transaction as VAT/stock effects. | A correction and its required evidence commit or roll back together; prior financial terms remain recoverable. | Inject an audit insert failure and assert no correction/VAT/stock change commits. Concurrent correction test proves serialized before/after values. |
| VAT rows may be updated in place; old transaction values survive only in audit metadata for this path. | Preserve original VAT/tax snapshots; record append-only adjustment/reversal rows linked to correction. | Historical filings and later replays can identify original and corrected amounts. | Assert original and correction rows remain queryable and net arithmetic is correct. |
| `stock_movement` is immutable by migration if deployed; its source reference is polymorphic text. | Link correction and fulfillment evidence to stock events using typed FKs or a reviewed typed-link design. | Prevent orphan or ambiguous evidence references. | FK/constraint tests plus deliberate invalid-link rejection. |
| `editStockRecord` reads initial state before row lock. | Capture authoritative before/after snapshots from the locked row and write movement/audit atomically. | Avoid stale correction audit snapshots during concurrent updates. | Concurrent adjustment test compares stored snapshots with resulting ledger. |

Keep existing RBAC boundaries. `super_admin` intentionally lacks `taxpayer.intelligence.search`; do not add this permission or use broad role bypasses to make unrelated tests pass. Legacy role guard aliases remain supported, while new role assignment stays limited to proposed role values. [RBAC permissions and aliases](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/lib/rra-rbac.ts:55>) · [RBAC tests](</C:/Users/PC/Downloads/taxflow/_support-ticket-workflow/tests/rra-rbac.test.ts:81>).

## 8. Idempotency and concurrency assessment

| Risk | Classification | Current evidence | Readiness requirement |
| --- | --- | --- | --- |
| Duplicate B2B sale after client retry | **Plausible risk, not a confirmed incident.** No request idempotency key/unique transaction constraint appears in sale input/schema. Stock locks prevent overselling but do not identify the same request on retry. | `createSaleForConfirmationInternal`. | Decide and add a seller-scoped request key plus payload fingerprint if product requirements confirm retry behavior. Test same-key/same-payload replay, same-key/different-payload rejection, and simultaneous submissions. |
| Duplicate retail sale after retry | **Plausible risk, not a confirmed incident.** No idempotency key is accepted; action commits before returning. | `createRetailSale`. | Consider a separate retail idempotency key; ensure retries cannot duplicate stock decrement, VAT, transaction, or audit. |
| Concurrent B2B reservations | Existing seller stock rows are locked in product order inside a transaction. **Partially protected** against overselling. | Sale creation. | Add concurrency tests for two requests competing for same stock and multi-product transactions. |
| Concurrent B2B confirmation/release | Transaction/reservation rows are locked; one-time status guards exist. **Partially protected** for current all-or-nothing lifecycle. | Confirmation, release helper, expiry. | Add race tests for confirm vs expiry/cancel and later dispatch/partial receipt races. |
| Correction vs correction or sale | **Plausible concurrency risk.** `modifyTransaction` does not lock transaction/stock before computing and writing adjustments. | `admin.action.ts` `modifyTransaction`. | Row locks and deterministic lock order; concurrent correction and sale tests. |
| Production key collision across businesses | **Schema scope mismatch.** Production idempotency unique index is global while replay lookup scopes manufacturer. UUID collision is unlikely, but same keys across businesses are not cleanly scoped. | `production_batch.idempotencyKey` index and production replay lookup. | Consider `(manufacturer_id, idempotency_key)` uniqueness after inspecting existing data; no incident inferred. |
| Reconciliation scan omits eligible rows | **Confirmed coverage limit.** Unordered query takes first 500 pairs. | `reconcileAndCreateFindings`. | Stable cursor pagination and scan completion tests beyond 500 fixtures. |

## 9. Migration compatibility and deployment risks

- Existing transaction rows contain agreement quantity, not independent dispatch/receipt facts. Keep legacy fulfillment marked `unknown/not recorded`; do not backfill assumed events.
- Existing `stock_movement` rows are scalar deltas and use polymorphic sources. New evidence needs stronger transaction/source relationships, but migration must not rewrite the immutable ledger.
- `stock_reservation` is unique per transaction and stores the full quantity. Extend it only with an explicit migration/backfill plan for active rows; better preserve original reserved quantity and derive remaining amount from append-only dispatch totals rather than overwriting its historical meaning.
- Current transaction status is free text with no status check visible in the schema. Existing comments omit runtime values such as expired/cancelled. Avoid a restrictive constraint until all historical values and transitions are inventoried. Prefer a separate fulfillment state initially.
- No business organization membership/representative authorization mapping was found in the reviewed buyer flow. Large-company receipt authorization needs a confirmed identity/role design.
- If adding indexes/constraints, inspect production row counts, duplicate keys, nulls, and existing constraint names before migration. Do not assume `0012`, `0014`, or later migrations ran in Neon.
- Keep migrations additive and staged: schema first, dual-compatible reads, then service writes, then reconciliation changes. Do not execute a migration until deployment state and rollback/recovery plan are reviewed.

## 10. Required policy and authorization decisions

1. Is order acceptance required before dispatch, or is seller dispatch allowed immediately after reservation? If both acceptance and receipt exist, they must be separate records and labels.
2. Which named buyer accounts/users are authorized to record business receipt, especially for institutional buyers? Is a business membership/authorized-representative table required?
3. Can a buyer make accepted goods available for resale immediately on each partial receipt, or must they remain provisional until the whole transaction is resolved?
4. How are shortage, damage, over-receipt, rejected goods, return-to-seller, and lost-in-transit quantities resolved? Who is allowed to decide each outcome, and what evidence is mandatory?
5. At what legally approved point are transaction amount, VAT records, and filing periods finalized or amended for partial delivery and later correction? This audit does not establish RRA policy.
6. Does buyer confirmation mean an order acceptance, receipt assertion, or both as distinct events? A recorded buyer assertion must not be described as independent physical proof.
7. What evidence storage and retention mechanism is approved for invoices, dispatch notes, inspection records, and receipts?
8. What is the cutover date and process for observed opening balances? Who validates the balances, and how are unverified historical periods labeled?
9. Which existing roles may record dispatch, buyer receipt, discrepancy resolution, and correction? Reuse narrow permissions where appropriate; preserve legacy aliases and current restrictions.
10. Should sale idempotency be implemented now? Confirm client retry behavior and inspect database uniqueness constraints first.

## 11. Proposed implementation sequence

Every stage should be independently reviewable and include service tests before the next stage begins.

| Stage | Current implementation | Proposed work | Expected behavior | Required tests |
| --- | --- | --- | --- | --- |
| 0. Policy and state contract | B2B uses one pending/confirmed status; retail completes immediately. | Approve event meanings, roles, tax finalization timing, bucket semantics, and equations. Keep retail exempt from customer confirmation. | One unambiguous contract for order acceptance, dispatch, receipt, discrepancy, and closure. | State transition table/property tests; confirm all policy questions are signed off. |
| 1. Additive evidence schema | Transaction stores agreed quantity; reservation one row/full qty; no dispatch/receipt tables. | Add minimal linked dispatch and receipt evidence plus append-only discrepancy resolution. Add separate fulfillment state only if derivation is insufficient. Keep legacy rows unverified. | Multiple dispatches and receipts per B2B product transaction, with actor/time/reference and validated quantities. | Migration/schema tests, FK/check/uniqueness tests, legacy-row compatibility, no fake backfill. |
| 2. B2B dispatch and receipt services | Buyer confirmation credits full agreed quantity. | Add authorized dispatch and buyer receipt actions; support partial records and quantity validation. Record effects and audit atomically. Define in-transit and remaining reservation from recorded quantities. | Each quantity is exactly one of remaining reserved, in transit, received/accepted, held, or explicitly resolved. | Full/partial dispatch, multiple receipts, over-dispatch rejection, retry, unauthorized actor, and injected failure rollback tests. |
| 3. Expiry/cancel/reject/dispute integration | Release restores full reservation; reversals use full transaction quantity. | Permit expiry/cancel to release only undispatched amounts; prevent automatic release of dispatched quantities; add explicit return/discrepancy resolution and linked reversal paths. | No double subtraction/addition, duplicate release, negative stock, or silent in-transit disappearance. | Five conservation scenarios in section 5 plus confirm-vs-cancel/expiry races and repeated-resolution tests. |
| 4. Financial correction and audit atomicity | `modifyTransaction` overwrites values and logs after commit. | Lock rows; validate with Zod; add immutable correction and VAT adjustment evidence; write audit in the same transaction. | Original, correction, stock effects, VAT effects, and audit are consistently recoverable. | Audit failure rollback, concurrent corrections, before/after correctness, VAT net and stock conservation tests. |
| 5. Historical reconciliation | Period totals compared with current stock; 500-pair cap; sparse refs. | Reconstruct from cutover snapshots and dated events; paginate; persist versioned inputs/source refs; report incomplete history distinctly. | Reproducible period closing balances with transparent gaps. | Fixed historical fixtures across periods, same-timestamp ordering, legacy incomplete markers, >500 paging, missing source and calculation-error handling. |
| 6. Idempotency and operational rollout | Production/payment have keys; B2B and retail sales do not. | Based on validated need, add scoped idempotency and safe retry responses; deploy additive migration, then enable writes behind compatibility checks. | Retries do not duplicate financial or stock effects; old clients/rows continue to work. | Concurrent same-key retries, conflicting payload, cross-business key scope, rollout/backward-compatibility checks. |

## 12. Acceptance criteria and test matrix

| Area | Acceptance criteria | Test coverage expected |
| --- | --- | --- |
| Retail | Retail sale completes without customer action; customer receipt is optional and does not block completion; existing stock/VAT/audit behavior remains atomic. | Retail action integration: transaction completed, exact stock delta, VAT and audit once, optional customer/no-customer behavior, retry behavior. |
| B2B state | Order acceptance, dispatch, receipt, and discrepancy have distinct actors/timestamps and legal transitions. | State-machine tests for allowed/forbidden transitions and actor ownership. |
| Partial dispatch | Dispatch total cannot exceed agreed quantity; reserved remainder is correct; dispatched quantity is not deducted twice. | One and multiple dispatch tests; competing dispatch requests; status/cancel races. |
| Partial receipt | Receipt totals are linked to dispatch; accepted, damaged, rejected, and unresolved quantities sum to measured receipt/dispatch without over-crediting stock. | Partial/multiple receipt arithmetic; excess and duplicate receipt detection; damaged/quarantine and unresolved shortage cases. |
| Cancellation/expiry/reversal | Only unshipped reservation is released; dispatched quantities remain traceable until resolution; repeated actions are harmless/rejected without duplicate movements. | Before-dispatch cancel; partial-dispatch cancel; expiry race; dispute/return; concurrent repeat. |
| Financial/tax consistency | Agreement values are preserved; approved final tax policy is applied once; corrections append evidence and atomically record VAT, stock, and audit. | VAT rounding/partial quantities, audit failure rollback, original value recovery, concurrent correction and confirmation. |
| Historical reconciliation | Result is deterministic for a specified cutover and period and includes input/source refs; legacy gaps are not treated as zero. | Snapshot replay, event order, boundary timestamps, missing opening data, correction event history, pagination >500. |
| Authorization | Seller can record only own dispatch; only the buyer business/authorized rep can record receipt; discrepancy resolution uses approved role; RBAC restrictions remain. | Positive/negative role tests including legacy-role aliases and assertion that `super_admin` still lacks `taxpayer.intelligence.search`. |
| Migration | Existing transactions/reservations/movements remain readable; no fabricated legacy evidence; additive deployment is repeatable and validated against actual database state. | Migration dry run on disposable representative snapshot, constraints with legacy values, rollback/recovery verification. |

Do not run database-backed tests against a shared or production database. Use an isolated disposable database for migration/integration tests after implementation is authorized.

## 13. Risks, dependencies, and explicit non-changes

**Risks/dependencies:** policy approval for tax timing and discrepancy disposition; authorized business representative identity; inventory bucket semantics; document storage/retention; production migration state and data quality; safe migration ordering; client behavior for retry/idempotency.

**Must not change in this phase or as a shortcut:**

- Do not create or infer dispatch/receipt evidence for legacy transactions.
- Do not make final-customer confirmation mandatory or create a retail pending-receipt workflow.
- Do not treat seller-entered retail records or buyer receipt assertions as independently verified physical proof.
- Do not silently overwrite historical transaction/correction facts or mutate append-only stock movement rows.
- Do not release a full reservation after partial dispatch or reverse a full transaction quantity without accounting for actual receipt/return/disposition.
- Do not make up VAT timing or RRA/EBM requirements.
- Do not weaken RBAC, grant `super_admin` `taxpayer.intelligence.search`, remove legacy-role compatibility, or broaden role access to make tests pass.
- Do not assume a repository migration has been applied to Neon.
- Do not implement Phase 3B or unrelated typecheck/lint fixes as part of this work.

## 14. Tests performed

Ran the safe, non-database focused suite:

```text
tsx --test tests/reconciliation.test.ts tests/product-journey.test.ts tests/risk-rules.test.ts tests/taxpayer-workspace.test.ts tests/rra-rbac.test.ts tests/production-schema.test.ts tests/tax-engine.test.ts
```

**Result: 61 passed, 0 failed.** The tests exercise pure reconciliation/graph/risk logic, validation schemas, tax arithmetic, and RBAC. They do not exercise transaction actions against PostgreSQL, migration deployment, dispatch/receipt persistence, or end-to-end cancellation/concurrency behavior. The database-backed `tests/payment-idempotency.test.ts` was not run.

## 15. Final readiness conclusion

The B2B evidence design is implementable, but **not ready for schema or production implementation until the policy decisions in section 10 are approved**. The most important first stage is to approve the B2B state model, quantity-conservation rules, authorized receipt actors, discrepancy disposition, and tax-finalization point. Then implement additive persistence and service logic in the staged order above.

This audit changed no application code, schema, migration, test, configuration, or production database. The requested readiness report is the only new file.
