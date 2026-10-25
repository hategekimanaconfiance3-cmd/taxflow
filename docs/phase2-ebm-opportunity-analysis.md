# Phase 2 — EBM limitations, operational gaps, and TaxFlow opportunities

**Review date:** 25 October 2026  
**Repository:** `codex/central-taxpayer-workspace`  
**Decision:** Analysis only. No application behavior, schema, or production deployment was changed.

## Executive Summary

The available official evidence does **not** establish a confirmed system-wide weakness in Rwanda Revenue Authority’s Electronic Billing Machine (EBM) ecosystem. The main source reviewed is the EBM 2.1 computer/tablet manual. It describes product and customer management, sales, purchases, imports, stock controls, manufacturing processing, cancellation/refund procedures, and reports. RRA separately lists four solution options: EBM 2.1 for Windows/tablet, EBM 2.1 for Android, Online EBM, and VSDC. Evidence about one variant cannot establish a limitation across all four.

The defensible opportunity is complementary intelligence: TaxFlow can correlate authorized records across businesses and workflows. It already has a substantial foundation—business-to-business transactions with buyer confirmation, stock movements, production declarations, import review, stock reconciliation findings, risk signals, product-journey search, taxpayer workspaces, RRA role controls, case workflows, audit logging, and reporting. These capabilities are not proof of EBM parity or RRA integration, and they operate only on data available to TaxFlow.

The most material TaxFlow gaps are batch-level chain of custody, location-aware inventory, raw-material-to-finished-product genealogy, independent evidence for declared production, external EBM/customs data exchange, and correction records represented as immutable versions. Existing analytics are rule-based indicators, not adjudications or validated measures of evasion. One reconciliation path described as dispatch/receipt mismatch cannot actually compare an independently recorded buyer receipt; an alternate tested pure-logic module can compare paired records, but data availability and production wiring need verification.

**Conclusion:** Treat Phase 3 as a staged, RRA-reviewed integration and evidence-quality program. Do not market TaxFlow as an EBM replacement, certified fiscal system, or RRA-endorsed service. Keep PR #17 open; this report does not merge or deploy anything.

## EBM Capabilities Reviewed

The [RRA EBM 2.1 computer/tablet user manual](https://www.rra.gov.rw/fileadmin/user_upload/EBM2.1_MANUAL_for_compute_and_tablet__english_version.pdf) describes the following workflows in its stated client scope:

- **Items:** item code and barcode, origin/type, units/packages, purchase and sale prices, tax type, opening/current/safety stock, search, and maintenance.
- **Customers:** corporate and individual customer records and customer selection in sales/purchase flows.
- **Sales and purchases:** sales/receipt workflows, purchase recording, supplier-originating sales, approval/release, cancellation/refund handling, and preservation of processed records.
- **Stock:** opening/closing stock, stock status, adjustments, transit/location handling, discarding, and manufacturing processing that consumes configured raw materials and produces finished goods.
- **Imports:** imported-item workflow with review/approval and cancellation actions.

The RRA [request and install EBM page](https://www.rra.gov.rw/en/ebm-electronic-billing-machine/request-and-install-ebm) lists EBM 2.1 Windows/tablet, EBM 2.1 Android, Online EBM, and VSDC. The [EBM FAQ](https://www.rra.gov.rw/en/ebm-electronic-billing-machine/faqs-about-ebm) describes support steps for errors and damaged/stolen devices. These documented procedures are evidence of operational support routes, not proof of a recovery weakness.

The RRA general homepage indicated maintenance during this review. No current technical VSDC/API specification, certification requirements, sandbox behavior, or cross-variant data model was verified. The computer/tablet manual is not used to infer what Android, Online EBM, or VSDC can or cannot do.

## Confirmed Limitations

**No confirmed EBM-wide limitation was established from the evidence reviewed.** The manual is useful for confirming documented computer/tablet capabilities, but the absence of a feature from that manual does not establish that the feature is unavailable in EBM, another EBM variant, or an RRA back-office system.

There are confirmed **TaxFlow implementation boundaries** documented in the matrix below. These are not claims that EBM is deficient. TaxFlow does not currently have a verified RRA fiscal invoice/EBM connector, and its recorded product journey does not allocate each downstream sale to a physical production/import batch. These limits should constrain product claims and guide validation.

## Operational Improvement Opportunities

1. **Connected but evidence-bounded supply-chain intelligence.** TaxFlow stores platform B2B seller/buyer/product/quantity/price/tax/time records and can aggregate buyer-seller flows. A business-level transaction graph is not physical proof that a particular carton or batch moved through that chain.
2. **Lot-level provenance.** Production batches and stock movements exist, but later sale records are not allocated to production/import lots. Add allocation only after product identifiers, receipt evidence, returns, splits, and adjustments have approved semantics.
3. **Production input/output evidence.** The RRA manual documents manufacturing processing with raw-material consumption patterns. TaxFlow production currently records a declared finished-product quantity and stock entry; it does not model recipe consumption or independent machine evidence. Production declarations therefore remain self-reported.
4. **Inventory reconciliation quality.** TaxFlow computes expected closing stock from opening adjustments, platform receipts, declarations, sales, and loss adjustments, and can open an advisory finding. Completeness depends on those inputs and time semantics; external/off-platform activity is not automatically included. Current stock is read as the recorded closing value, so historical-period comparisons need care.
5. **Buyer receipt matching.** One `lib/ai/reconciliation.ts` routine comments that it compares dispatch with buyer-confirmed quantity, but its current transaction model holds one agreed quantity and the routine flags pending records rather than reading a separate receipt quantity. A separate pure-logic supply-chain reconciliation module has tests for missing/quantity/amount mismatch when paired dispatch and receipt records are provided. Verify which path is wired to production and whether the source data exists before relying on mismatch alerts.
6. **Customer/business identity context.** TaxFlow has verified platform buyer lookup for B2B and an owner-scoped customer directory for retail. A saved customer TIN is format-checked, not an RRA validation; walk-in consumer transactions may not establish whether a purchaser later resells goods.
7. **Correction history.** TaxFlow dispute and stock correction flows capture roles, reasons, audit events, and financial/stock effects. In the `adjust_amount` path, transaction amount fields are updated in place while prior values are placed in audit financial-effect metadata. This is traceable but is not a first-class immutable corrected-version chain.
8. **Geographic/branch visibility.** TaxFlow stock is currently business/product scoped; the core stock and sale model does not provide location-level balances or physical hand-off evidence. The EBM manual itself documents location/transit functions, so a branch/location feature would be TaxFlow parity/interoperability work, not proof that EBM lacks it.

## Hypotheses Requiring RRA Validation

Before making any categorical claim, confirm with RRA and the relevant EBM variant:

- Whether and how EBM 2.1 variants and RRA back-office tools expose cross-taxpayer transaction relationships, product identity, batch/lot origin, or system-wide stock analysis to authorized staff.
- Whether a fiscal invoice/product line carries a stable identifier that is available downstream and can lawfully be joined across taxpayer records.
- How purchase/receipt quantities, partial delivery, returns, transfer, and location identifiers are represented across variants.
- Whether the four variants differ in offline capture, synchronization, duplicate prevention, backup/restore, correction, and retry behavior.
- The currently approved requirements for fiscal receipts, credit notes/refunds, cancellation after release, correction numbering, signatures, TIN verification, product tax classifications, and VSDC certification/API access.
- Which legal basis, purpose limitation, retention, notice, and access controls apply to cross-business analytics, behavioral risk indicators, consumer-to-reseller signals, and any proposed NID/biometric linkage.
- Whether machine/production-system feeds are supported or acceptable evidence, and which standards/security controls RRA requires.

## TaxFlow Advantages

These are code-backed capabilities, not claims of RRA approval or independently verified production operation:

- **B2B transaction lifecycle:** seller and buyer are linked to the product, quantity, price/tax snapshot, status, and timestamps; pending sales reserve stock and buyer confirmation updates stock/VAT/movement records in transactions.
- **Inventory records:** per-business/product balances, stock movements, adjustments, production entries, import confirmation, and stock-correction workflows exist.
- **Production declaration:** manufacturers have product and batch references; production entry records a batch, stock update/movement, and audit record transactionally. No independent production verification is implied.
- **Traceability search:** RRA-authorized Product Journey search can retrieve transactions and supporting production/import/adjustment records. Those source records are not allocated to each downstream sale, so results are related evidence, not unit-level chain of custody.
- **Cross-business view:** supply-chain analytics aggregate confirmed/completed platform transactions by seller, buyer, and product. The graph represents recorded commercial relationships, not physical movement verification.
- **Advisory risk/reconciliation:** deterministic arithmetic/VAT/stock/price rules and stock reconciliation can surface review candidates. Findings are advisory; a score or finding is not proof of evasion.
- **RRA staff controls and workflow:** taxpayer intelligence lookup is permission-gated, reason-coded, rate-limited/audited in the reviewed paths; case, support, dispute, finding review, and audit workflows exist. Access remains role-specific.
- **Reporting:** TaxFlow has trader/admin tax, sales, inventory, compliance, and risk reporting. It complements platform data but does not replace official EBM reports.

## TaxFlow Remaining Gaps

| Area | EBM Capability | Limitation/Gap | Evidence | Classification | TaxFlow Opportunity | Requires RRA Validation? |
|---|---|---|---|---|---|---|
| Product identity and traceability | Computer/tablet manual documents item codes/barcodes, origin/type, units, customer sales, and stock. | The reviewed guide does not establish whether those identifiers link the same physical goods across taxpayer invoices or batches. TaxFlow has product IDs and a journey search, but no lot allocation on downstream lines. | RRA manual, Item Management/Sales/Stock; `db/schema.ts` product, transaction, transactionItem, productionBatch; `lib/actions/product-journey.action.ts`. | Hypothesis — Requires RRA Validation | Agree a shared product/lot reference, scan/receipt evidence, and split/merge/return handling; surface provenance only where linked evidence exists. | Yes |
| Chain of custody | EBM records sales and stock workflows; guide covers multiple stock controls. | No official evidence reviewed proves a complete manufacturer-to-final-buyer physical chain is or is not available in every EBM variant. TaxFlow graph links businesses by recorded transactions, not physical lots. | Manual; `lib/actions/admin-supply-chain.action.ts`; `lib/product-journey-graph.ts`. | Hypothesis — Requires RRA Validation | Extend existing graph with explicit, confidence-labeled line/lot allocation and unresolved links, subject to an approved data contract. | Yes |
| Manufacturing | Manual documents processing with configured raw-material consumption and finished-product output. | TaxFlow production is a self-reported batch declaration and stock entry; no raw-material recipe consumption, machine integration, or independent production proof is modeled. This is a TaxFlow gap, not an EBM limitation. | Manual, Stock Management/manufacturing; `lib/production-service.ts`; `db/schema.ts` productionBatch. | Operational Improvement Opportunity | Model auditable inputs/yield/losses and evidence references; reconcile declared output to sales and stock as an advisory check. | Yes, for data exchange/evidence rules |
| Production anomaly review | Manual describes production operations; no claim about EBM analytics is inferred. | TaxFlow reconciliation uses declared production. It cannot establish actual output from a declaration alone. | `lib/ai/reconciliation.ts`; `lib/ai/reconciliation-logic.ts`; `lib/ai/risk-scoring.ts`. | Operational Improvement Opportunity | Improve input completeness, period correctness, evidence provenance, and human-review explanation before adding more scoring. | Yes, for any external production data |
| Stock management | Manual documents opening/closing, status, adjustment, location/transit, discard, and manufacturing stock operations. | No EBM limitation established. TaxFlow has business/product stock and movements but not core location-level balances or explicit location transfer. | Manual, Stock Management; `db/schema.ts` stock/stockMovement/stockAdjustment; admin stock actions. | Operational Improvement Opportunity | Add location-aware ledgers only after roles, transfer states, period-close semantics, and cost basis are approved. | Yes |
| Stock reconciliation | Manual describes stock workflows; it does not establish absence of automated reconciliation. | TaxFlow reconciliation relies on recorded opening adjustments, platform purchases, declared production, sales, approved losses, and current balance. Missing/off-platform inputs or period mismatch can create misleading alerts. | `lib/ai/reconciliation.ts`; `lib/ai/reconciliation-logic.ts`; `tests/reconciliation.test.ts`. | Operational Improvement Opportunity | Define period snapshots and data completeness flags; show formula, source records, coverage, and uncertainty to reviewers. | Yes, for EBM data feeds |
| Buyer-to-seller linkage | Manual documents purchase and sales workflows. | No evidence reviewed proves cross-taxpayer linking is absent. TaxFlow links B2B parties and records a transaction quantity; its service mismatch path has no separately recorded receipt quantity. | Manual, Purchase/Sales; `lib/actions/transaction.action.ts`; `lib/ai/reconciliation.ts`; `lib/intelligence/reconciliation.ts`. | Operational Improvement Opportunity | Use matched seller dispatch and buyer receipt records, add partial/return states, and distinguish an unmatched record from confirmed shortage. | Yes |
| Consumer/reseller identity | Manual documents customer management for corporate and individual customers. | Resale behavior by purchasers without a business TIN was not determined from official sources. TaxFlow walk-in retail does not prove final-consumer status; saved retail TIN is not externally verified. | Manual, Customer Management; `db/schema.ts` customer/transaction; `lib/actions/customer.action.ts`; `lib/actions/admin-taxpayer-discovery.action.ts`. | Hypothesis — Requires RRA Validation | Build purpose-limited, explainable review indicators from authorized repeat-volume patterns; never infer guilt or automatically classify someone as a trader. | Yes |
| EBM/VSDC integration | RRA lists Windows/tablet, Android, Online EBM, and VSDC options. | TaxFlow has no verified RRA fiscal connector, certification, signed receipt, or EBM transaction state synchronization. This is a confirmed TaxFlow boundary. | RRA request/install page; repository search; `docs/ebm-capability-parity-audit.md`. | Operational Improvement Opportunity | Obtain current official API/certification material and sandbox; design adapter only after approval. Do not claim TaxFlow receipts are fiscal invoices. | Yes |
| Under-reporting analytics | EBM manual documents billing and operational records; no conclusion about central analytics is drawn. | TaxFlow risk scoring is a heuristic on platform records; it cannot see unrecorded cash/off-platform sales and is not a validated evasion detector. | `lib/ai/risk-scoring.ts`; `lib/ai/reconciliation.ts`; `tests/risk-rules.test.ts`. | Operational Improvement Opportunity | Add coverage/confidence, cohort calibration, drift/false-positive monitoring, and evidence-linked human review; avoid accusatory labels. | Yes, for legal/policy and EBM data scope |
| Corrections/refunds | Manual describes cancellation/refund/rollback and states processed records are not deleted. | No EBM correction weakness is established. TaxFlow has audited dispute/reversal workflows, but adjusted transaction amounts are updated in place with prior values represented in audit metadata rather than a dedicated version chain. | Manual, Sales Management; `lib/actions/dispute.action.ts`; `db/schema.ts` dispute/auditLog. | Operational Improvement Opportunity | Preserve immutable original/correction versions, approval/reason/reference, and reversal links; align document semantics with RRA first. | Yes |
| Cross-business analytics | Manual demonstrates taxpayer operational functions; it does not establish RRA-wide analytics scope. | TaxFlow can aggregate authorized platform transactions and stock views, but only records present in TaxFlow. Legal authorization and EBM access are not established. | `lib/actions/admin-supply-chain.action.ts`; `lib/actions/admin-stock.action.ts`; admin analytics actions. | Hypothesis — Requires RRA Validation | Join only authorized, purpose-bound datasets with role-filtered access and auditable queries. | Yes |
| Real-time intelligence | No evidence reviewed establishes real-time analytics limits for all EBM variants. | TaxFlow findings/score are advisory and based on its stored data; real-time completeness and alert quality are not empirically validated here. | `lib/actions/ai-finding.action.ts`; `lib/ai/risk-scoring.ts`; risk and findings tests. | Operational Improvement Opportunity | Prioritize freshness/quality metadata, explainability, calibrated thresholds, and reviewer outcomes before claiming predictive performance. | Yes, for integrations and policy |
| Taxpayer workspace and staff workflow | Manual is a taxpayer operations guide, not a complete statement of RRA staff back-office capability. | TaxFlow has permission-gated taxpayer intelligence, case/support workflows, audits, and separate roles. Equivalence to official RRA staff systems is unknown; RBAC tests show two failing expectations in this run. | `lib/actions/admin-tin-lookup.action.ts`; `lib/actions/rra-case.action.ts`; `lib/auth-guard.ts`; `tests/rra-rbac.test.ts`. | Hypothesis — Requires RRA Validation | Continue least-privilege review, resolve RBAC test mismatches, and validate access policy with RRA. | Yes |
| Reports and sector/geographic trends | Manual contains taxpayer-level sales/stock reports; no complete view of all report variants was available. | TaxFlow has platform reports and analytics but cannot claim national coverage, official liability, or reliable geographic/sector results without representative data and authorization. | Admin report/analytics actions; `docs/ebm-capability-parity-audit.md`. | Operational Improvement Opportunity | Add completeness and scope labels; use official definitions and carefully separate recorded turnover, tax assessed, paid, and estimated risk. | Yes |
| Outages, recovery, and continuity | RRA FAQ documents support procedures for errors and damaged/stolen devices, including contacting RRA. | No evidence reviewed proves a systemic EBM recovery or synchronization weakness. TaxFlow retry/offline behavior across workflows and EBM variants was not tested. | RRA EBM FAQ; no variant-wide operational test performed. | Hypothesis — Requires RRA Validation | Map failure/retry/idempotency procedures for each official variant and test TaxFlow integration behavior against RRA guidance. | Yes |

## Risk and Compliance Considerations

- **Decision support only:** stock, price, identity, and network anomalies are triage signals. A finding must state the observed records, calculation, time window, missing inputs, and review action. No automated accusation, assessment, account restriction, or enforcement decision should follow from a score alone.
- **Data minimization and authorization:** cross-taxpayer joins, consumer purchase patterns, contact details, and any NID/biometric proposal require a documented lawful purpose, access role, retention period, security controls, and RRA approval. Continue backend RBAC and audit logging.
- **Financial integrity:** tax rates, product classifications, correction documents, and period-close arithmetic must be deterministic, tested, auditable, and transactionally recorded. Do not infer statutory treatment from transaction patterns.
- **Evidence quality:** platform transactions are not a complete representation of the economy. Missing imports, cash sales, legacy balances, external suppliers, delayed confirmation, and duplicate/correction states can distort analytics.
- **Product claims:** TaxFlow is not shown here to be EBM-certified, an official RRA integration, or a replacement for fiscal invoicing. Existing reports and receipts should not be represented as official EBM records.
- **Model governance:** heuristic thresholds and scoring weights require documented rationale, representative validation, bias/false-positive review, versioning, and human outcomes before operational use.

## Priority Matrix

Priority describes recommended TaxFlow work, not the severity of a proven EBM defect.

| Priority | Recommendation | Why now | Gate |
|---|---|---|---|
| **P0 — Critical** | Obtain RRA-confirmed scope for EBM variant, APIs, fiscal document rules, legal authority, data access, certification, and test environment. | Prevents unsupported integration, tax, and product claims; establishes lawful data boundary. | RRA written guidance/approval and security/data governance review. |
| **P1 — High** | Improve transaction evidence and correction lineage; verify receipt-match implementation; make stock reconciliation period-aware and completeness-aware. | These affect whether existing findings are explainable and trustworthy. | Reviewed data semantics, tests, and authorized reviewer workflow. |
| **P1 — High** | Define product/lot identity and receiving/allocation events through the existing stock and journey architecture. | Enables stronger provenance while preventing business-level edges from being misrepresented as lot custody. | Agreed identifiers, receipt/return/split process, data-sharing authorization. |
| **P2 — Medium** | Add location and raw-material/output relationships to stock/production models; report unresolved allocations explicitly. | Extends existing features and aligns with documented operational concepts without duplicating modules. | Location/recipe business rules, migration review, reconciliation tests. |
| **P2 — Medium** | Validate and monitor risk indicators on representative labeled cases; improve alert context and reviewer feedback. | Reduces misleading alerts and measures utility before broader rollout. | Data access approval, evaluation protocol, false-positive review. |
| **P3 — Future** | Explore machine evidence, automated cross-variant synchronization, and optional identity-verification mechanisms. | Higher cost and legal/security dependency; not justified by current evidence alone. | RRA feasibility, legal/privacy approval, security assessment, consent/purpose design. |

## Recommended Phase 3 Solutions

1. **RRA discovery and data-contract phase:** interview the responsible RRA teams; choose the relevant EBM variant; obtain current specifications and sandbox; document fiscal receipt, identity, product, correction, retry, and certification rules; approve a data-sharing and access model. Do not build a connector before this gate.
2. **Evidence and ledger hardening:** verify the production dispatch/receipt path; represent receipt, partial receipt, return, transfer, and correction as distinct linked events; add immutable correction versions; make stock reconciliation period-bounded and expose missing inputs and formulas.
3. **Product and batch provenance:** establish catalog/code/barcode mapping and a persistent batch/lot identity; capture allocation from produced/imported stock to each dispatch and receipt line; support split/merge and returns; show evidence source and confidence. Preserve graceful “unknown/unlinked” states.
4. **Production and location controls:** only after approved semantics, model raw-material inputs, yields, declared losses, facility/location, and equipment references; reconcile declarations against ledger events; keep automated results advisory pending authorized review.
5. **Calibrated intelligence and workflow:** measure anomaly precision/recall on an approved sample; record reasons, data completeness, threshold/model version, reviewer decision, and audit link; keep all enforcement decisions human and role-authorized.
6. **Integration rollout:** test idempotency, retries, duplicate messages, correction reconciliation, outages, and recovery in the RRA sandbox; complete security and certification reviews; only then consider production readiness through the separately authorized release process.

## Testing and Verification Results

Focused command run:

```text
tsx --test tests/reconciliation.test.ts tests/product-journey.test.ts tests/risk-rules.test.ts tests/taxpayer-workspace.test.ts tests/rra-rbac.test.ts
```

**Result: 53 tests; 51 passed, 2 failed, 0 skipped.** The failures were existing RBAC expectation mismatches:

1. `super_admin has every defined permission after hardening` expects `taxpayer.intelligence.search` to be granted.
2. `legacy role names are rejected for new staff account creation` expects `compliance_officer` rejected by `staffAssignmentRoleSchema`.

The remaining 51 focused tests passed, including product-journey graph handling, pure supply-chain receipt/mismatch calculations, inventory balance checks, price deviation behavior, deterministic risk rules, taxpayer workspace access reason/data-category rules, and most RRA role boundaries. The test named `missing buyer receipt is flagged for review` tests a pure helper supplied with a missing receipt; it does not demonstrate that live EBM receipts are ingested or matched in production.

No database-backed integration test or external EBM/VSDC connection was performed in this Phase 2 review. The test command initially failed due to a package-manager store lock, and a direct run hit a Node `uv_os_get_passwd` environment error; the focused suite was then run successfully using the existing local TypeScript runner and a temporary Node `userInfo` preload. These environment workarounds do not change the application.

Code inspection establishes implementation presence only; it does not establish production deployment, RRA authorization, data completeness, or operational accuracy. The two failed permission assertions need resolution before claiming the tested RBAC suite is clean. No new application tests were added because Phase 2 makes no implementation changes.

## Files/Modules Reviewed

- **Official sources:** RRA EBM 2.1 computer/tablet manual; RRA “Request and Install EBM”; RRA EBM FAQs; RRA homepage maintenance state.
- **Database:** `db/schema.ts`, relevant migrations for users/customers, products, transactions/items, stock/movements/adjustments, production batches, imports, cases/disputes, AI findings, and audit records.
- **Transactions and inventory:** `lib/actions/transaction.action.ts`, `lib/actions/admin-stock.action.ts`, `lib/actions/admin-stock-correction.action.ts`, `lib/production-service.ts`, import actions, `lib/ai/reconciliation.ts`, `lib/ai/reconciliation-logic.ts`, `lib/intelligence/reconciliation.ts`.
- **Traceability and analytics:** `lib/actions/product-journey.action.ts`, `lib/product-journey-graph.ts`, `lib/actions/admin-supply-chain.action.ts`, `lib/actions/supply-chain-stats.action.ts`, admin report/analytics actions.
- **Risk, taxpayer, and governance:** `lib/ai/risk-scoring.ts`, `lib/actions/ai-finding.action.ts`, `lib/actions/admin-tin-lookup.action.ts`, `lib/actions/admin-taxpayer-overview.action.ts`, `lib/actions/admin-taxpayer-discovery.action.ts`, `lib/actions/rra-case.action.ts`, `lib/actions/dispute.action.ts`, `lib/auth-guard.ts`.
- **Prior audit and tests:** `docs/ebm-capability-parity-audit.md`; `tests/reconciliation.test.ts`, `tests/product-journey.test.ts`, `tests/risk-rules.test.ts`, `tests/taxpayer-workspace.test.ts`, `tests/rra-rbac.test.ts`.

## Phase 2.1 RBAC Verification Addendum — 25 October 2026

The two RBAC failures recorded above were investigated and resolved without changing taxpayer authorization boundaries:

- **Super Admin permission expectation:** the old test incorrectly expected every permission, including `taxpayer.intelligence.search`. The existing design intentionally withholds that operational permission from `super_admin`; the taxpayer lookup action excludes that role and the taxpayer-workspace test asserts denial. The test now verifies all other grants and explicitly verifies this denial. No permission was added.
- **Legacy assignment expectation:** legacy role values remain in the role catalogue and permission map because existing staff records and server guards still use them. They are now excluded from new account and role assignments. Historical role parsing/display remains available; the staff assignment UI offers only current roles and identifies legacy assignments for explicit replacement.

`staffRolesSchema` now validates new assignments against current proposed roles; single-role creation uses `staffAssignmentRoleSchema`. The staff management display still recognizes legacy values. This preserves existing authorization compatibility while preventing creation or reassignment of deprecated roles.

**Verification:** RBAC suite **34 passed, 0 failed**; focused Phase 2 suite **53 passed, 0 failed, 0 skipped**; `tsc --noEmit` **failed with 146 repository diagnostics**, all in unrelated files (none in the RBAC, staff schema/action, or staff UI files changed for Phase 2.1); targeted ESLint **passed**; Next.js production build with Webpack **passed**. The build reports that Next skips its internal type validation, so it does not override the separate typecheck failure. The default Turbopack build could not resolve the parent-installed Next.js package from this nested project path; the Webpack production build completed successfully. Build emitted existing environment warnings for unset `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` during static generation.

---

**Phase 2 disposition:** Stop after analysis. Phase 3 items above are proposals only; do not implement them until reviewed and approved. Keep PR #17 open. Do not merge or deploy without explicit authorization.
