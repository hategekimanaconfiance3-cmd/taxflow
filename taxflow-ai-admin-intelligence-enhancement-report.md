# TaxFlow AI Admin Intelligence Enhancement Report

**Review date:** 26 October 2026

**Repository:** `C:/Users/PC/Downloads/taxflow/_support-ticket-workflow`

**Baseline reviewed:** `4f1da053ae0ff60882bdca3c644d2c4352065e78` (`codex/central-taxpayer-workspace`)
**Scope:** Existing RRA/admin AI, its tools and data boundaries, and one safe high-value improvement. No schema, VAT, stock, or RBAC policy changes.

## 1. Current AI architecture

TaxFlow has a dedicated RRA Intelligence Assistant at `app/(admin)/admin/intelligence/assistant/page.tsx`, rendered by `components/admin/intelligence-chat.tsx`. The admin shell also exposes a compact Ask AI panel. Both use `POST /api/ai/query`; this is an existing role-aware assistant, not a new chatbot.

The query route authenticates from the server session, verifies active RRA staff and `ai.assistant.use`, derives role assignments from the database, and builds a server-side tool allowlist through `lib/ai/rra-tool-access.ts`. It parses only visible text from recent conversation messages, discards client-supplied tool results, rejects some prompt-injection phrases, limits requests, writes a hashed-question audit record, and streams a read-only Gemini response. RRA tool calls are limited to five model steps. This is a useful least-privilege foundation.

There are also separate taxpayer-intelligence actions in `lib/actions/admin-tin-lookup.action.ts`. Those reload role-authorized data on the server and audit which categories were accessed. They have their own short AI summary/follow-up prompt, so answer behavior is not yet governed by a single shared evidence contract.

## 2. Current capabilities

| Capability | Existing implementation | Assessment |
|---|---|---|
| Taxpayer profile and summary | `getTaxpayerIntelligence` calls the permission-filtered `getTaxpayerIntelligenceForAI` action. | Useful server filtering; it returns recent, bounded records and an access correlation ID. It is not a complete historical investigation. |
| Directory search | `lookupTrader` and `searchTraders` search registered businesses. | Role-gated at tool selection; results are bounded. Directory fields include TIN and clearance. |
| Transactions | `getTransactions` queries transaction/product/seller rows with optional seller/buyer TIN, product, status, and dates. | Up to 50 rows; returned-page totals are not a full matching-set aggregate. Buyer-side business identity is not fully surfaced in this result. |
| Stock and movements | `getStockLevels` returns current stock; `getStockMovements` returns recorded before/after quantities, movement type, reason, and date. | Good basis to answer movement questions where history exists. Movement IDs and date filters are absent from the AI tool result; current stock alone does not establish origin. |
| Tax/VAT | `getTaxStatus` summarizes recorded VAT output/input and confirmed payments. | All-time totals, no period selector; a stored balance is not an official liability determination. |
| Risk and behavior | `getRiskAssessment` computes the existing five-factor heuristic; `getBehavioralAnalysis` runs behavioral analysis. | Advisory signals exist, but score calibration, completeness, source references, and period semantics are weak. The risk tool wording was unsafe and is corrected in this change. |
| Supply chain | `traceSupplyChain` attempts to join confirmed/completed product transactions; `traceProductJourney` uses the protected product-journey action. | The product-journey tool returns real transaction and origin records with references. The separate chain builder infers chronological resales from a bounded transaction set and cannot establish physical product lineage. |
| Imports | `getImportDeclarations` returns recorded declaration, quantities, status, and references. | Read-only and bounded, with role filtering at the AI tool boundary. |
| Production | The taxpayer summary returns declared batches to roles with stock/traceability scope; product journey can return production batch origin records. | Production quantities are taxpayer-declared records; no independent physical verification is implied. There is no dedicated production trend or downstream trace calculation tool. |
| Reconciliation | `lib/ai/reconciliation.ts` and `lib/ai/reconciliation-logic.ts` contain inventory reconciliation and mismatch helpers. | Not directly available as an RRA assistant tool. The current dispatch mismatch helper does not compare persisted dispatch and receipt evidence; its comments describe pending age/non-integer proxies instead. Do not present that helper as receipt reconciliation. |
| Audit | Taxpayer intelligence can return a bounded audit-history summary to roles with `audit.trail.read`; AI query use is audit logged with selected modules. | The dedicated assistant has no general audit-history drilldown tool. Taxpayer snapshot audit rows omit direct source IDs. |
| Writes/actions | The RRA assistant registry contains read-only tools only. | Appropriate. Do not add mutation tools without a separately authorized, human-confirmed workflow. |

## 3. Current weaknesses

### Evidence and answer quality

- The RRA system prompt already says not to invent records and to distinguish stored data from explanation, but it does not require a consistent fact/calculation/signal/interpretation/unknown structure. This has been strengthened for investigation-oriented responses.
- Some tools provide source IDs, while others return only labels and values. This makes it hard to cite every conclusion or open the underlying record from chat.
- Product relationship inference and physical custody are not the same thing. A timestamp-ordered resale is a possible transaction chain, not proof that specific units came from a specific batch or dispatch.
- The query endpoint audits modules used, but the general tool outputs do not uniformly include source identifiers, matched-row totals, truncation details, or evidence completeness.
- The AI TIN snapshot has no requested time range and uses per-module recent-row caps. It must not be described as complete history. The standard TIN-search action supports an access reason, while the AI snapshot path currently does not ask for one; align those flows in a later privacy/audit review.

### Risk and anomaly behavior

- `lib/ai/risk-scoring.ts` describes its output as a “fraud risk score,” although it is a hand-weighted heuristic, not proof or a calibrated probability.
- On query errors, factor calculations return `value: 0` and `description: "Unable to compute"`. Several “no recent data/no obligations” cases also return zero. The composite can therefore turn missing evidence into a low score.
- The risk assessment combines different observation periods and data sources; it does not expose evidence record IDs or a defensible confidence measure.
- The persisted `risk_assessment` table and the on-demand `computeRiskScore` path are separate. The AI tool uses the live heuristic rather than a reviewed persisted assessment.
- Behavioral, risk, and reconciliation results must remain signals requiring human review, never fraud findings or enforcement decisions.

### Supply chain, inventory, production, and B2B evidence

- `stock` is a current quantity snapshot. Older/opening quantities may lack complete movement history; stock changes before the movement-recording baseline cannot be fully reconstructed.
- The AI can query stock movements but not a single authoritative reconciliation package joining movement source, transaction, production batch, and receipt evidence.
- `production_batch` stores declared quantity and status. `independently_supported` exists as a status value, but presence of a declared batch alone does not prove physical production.
- B2B acceptance, dispatch, and receipt tables exist in `db/schema.ts`, but there are no corresponding AI retrieval tools. The public dispatch/receipt actions currently fail closed pending lifecycle validation, so the AI must not claim these workflows are operational or fabricate evidence.
- Legacy transactions must not be retroactively described as having acceptance, dispatch, or receipt evidence.
- Final-customer retail sales have no customer-confirmation requirement; do not treat missing retail receipt confirmation as a discrepancy.

### Dashboard and interaction

- The dedicated assistant is permission-aware and shows role-derived query suggestions. It renders assistant text but hides tool-call parts; it has no evidence cards or verified links to source records.
- The compact admin Ask AI panel is convenient but does not provide investigation context or visible module/source receipts.
- The Super Admin dashboard has AI and analytics surfaces, but the assistant's data allowlist is not a substitute for dashboard role/page checks. Dashboard redesign is outside this implementation.

## 4. Data sources available to the AI

Current server-side sources include `user`, `transaction`, `product`, `stock`, `stock_movement`, `vat_record`, `tax_payment`, `import_declaration`, `dispute`, `support_ticket`, `rra_case`, `production_batch`, and `audit_log`, plus TIN directory data from the separate TIN database. The schema also contains `stock_reservation`, `business_representative`, `b2b_order_acceptance`, `b2b_dispatch`, `b2b_receipt`, `stock_adjustment`, `ai_finding`, `risk_assessment`, and `ai_audit_log`.

Having a schema table does not mean the AI can query it or that its workflow is active. In particular, dispatch/receipt evidence is not exposed to RRA AI and those mutation actions remain disabled. Source records are returned only through role-gated server tools; the model is not given the whole database.

## 5. Recommended AI tools

Keep the existing tool-based design and evolve it with narrow, audited retrieval tools:

1. **Retain and improve** taxpayer summary, transaction search, current stock, stock movement, tax summary, risk signals, product journey, and import search.
2. Add **bounded date filters and pagination metadata** to transaction, movement, taxpayer, import, and production queries where authorized. Return matched count, returned count, period, and `hasMore` so the model cannot mistake a page for a complete set.
3. Add a **read-only reconciliation retrieval tool** only after reconciliation inputs are validated against real source rows. It should return arithmetic inputs and linked IDs, explicitly report opening-stock/history gaps, and not create findings during an ordinary chat query.
4. Add **production history/trend** against `production_batch`, with declared/independently-supported distinctions and batch reference IDs.
5. Add **business relationship retrieval** based on recorded transaction counterparties. Label transaction-supported links “recorded relationship”; never claim physical custody or ownership of units from those links alone.
6. Add **dispatch/receipt retrieval** only after Phase 3B.2 lifecycle validation and production enablement. It must return separately classified received, accepted, damaged, rejected, and disputed quantities with evidence IDs.
7. Add a **read-only investigation assembler** after those tools share stable result contracts. It should call only the modules allowed by current role permissions, and report unavailable modules rather than bypassing them.

## 6–10. Domain capability recommendations

### Taxpayer intelligence

Support explicit periods, compare equivalent date windows, and display the actual records included. For “what changed,” calculate before/after metrics from bounded queries and label them calculations. Taxpayer lookups should align with the standard access-reason and audit workflow.

### Transaction intelligence

Return transaction IDs, both parties when present, product, quantity/unit, status timestamps, and linked stock/evidence references when those relations exist. Distinguish all statuses. Avoid aggregating only a truncated page and calling it the full-month total.

### Supply-chain intelligence

Start with records that directly join businesses and transactions. Label the result “recorded transaction path.” Show verified dispatch/receipt as separate evidence only when records exist. An unobserved link is unknown, not proof of diversion or fraud.

### Stock intelligence

Provide movement IDs, source type/source ID, product, before/delta/after, actor, reason, and period. Reconcile only from validated opening stock, receipt/purchase, production, sales, and approved adjustments. Flag unverified opening balances and missing movement history as data gaps.

### Production intelligence

Report declared quantities, batch references, status, period, and linked stock movements. Downstream traceability should be described as a transaction quantity comparison unless unit/batch allocation is explicitly recorded. Never say TaxFlow independently observed production without independent evidence.

### Risk/anomaly intelligence

Keep signals explainable and deterministic where possible. Return formula/version, observation window, sample count, contributing record references, missing inputs, and data completeness. Calibrate thresholds against reviewed outcomes before presenting them as operational risk tiers. Make all model/rule signals advisory.

## 11–15. Investigation mode, evidence, confidence, and data quality

An investigation mode is a good next stage, but it should be a structured read-only orchestration over the same authorized tools—not a separate database access layer. Its result should contain:

- Executive finding (with period and scope)
- Facts and source-record references
- Calculations with inputs/formula
- Signals with rule/model version and supporting evidence
- Interpretation separated from verified facts
- Contradictions and data gaps
- Recommended human review step

Confidence should be qualitative and derived from known evidence coverage, not a fabricated percentage. Report “not assessed” when the system cannot measure coverage. If record history is incomplete, state why and bound the conclusion to the available period. Unknown values must remain unknown and must not be converted to zero.

## 16. Super Admin dashboard integration

Recommend a later “TaxFlow Intelligence” area, permission-gated independently from the Super Admin settings console. It could surface:

- reviewed/queued AI findings, each linked to source records;
- material activity changes for authorized operational roles;
- stock reconciliation gaps and unresolved discrepancies;
- supply-chain changes supported by recorded transactions;
- an optional dated briefing with clear source coverage and generated-at time;
- “Ask TaxFlow Intelligence” with visible authorized modules and evidence links.

Do not give `super_admin` taxpayer search as a shortcut. The current policy is that Super Admin alone receives no taxpayer intelligence tools; operational access requires the appropriate separately assigned role. No dashboard redesign was made here.

## 17. Security and RBAC review

`POST /api/ai/query` checks the authenticated active account, active RRA staff row, and `ai.assistant.use`. Tool names are derived from database-assigned roles through the permission map. Data retrieval actions such as taxpayer intelligence and product journey also re-check their specific permissions server-side. The RRA assistant has no mutation tools.

The deliberate Super Admin restriction is intact: `getRRAAIToolNames("super_admin")` returns no tools, and the `taxpayer.intelligence.search` permission remains denied for the `super_admin` role in the RBAC tests. Do not change that policy in order to improve AI capability. Tests already cover role-specific tool exposure; this change adds no permission grants.

Future work should add route/action integration tests for every tool's permission and access-reason requirements, including mixed-role staff assignments, revoked/inactive staff, and direct invocation attempts.

## 18. Prompt-injection protection

Current defenses include server-derived identity and tool allowlists, stripping client-supplied tool-result parts from chat history, a bounded text-only context, an injection phrase filter, and prompt rules treating tool results as untrusted data. These are useful layers, but a phrase filter is not a complete injection defense. Continue to keep data retrieval and authorization in code, bound tool results, escape/encode data in prompts, and ensure retrieved strings cannot add tools, modify permissions, or trigger writes.

The RRA prompt now explicitly separates FACT, CALCULATION, SIGNAL, INTERPRETATION, and UNKNOWN for investigation-style answers, while allowing concise answers for simple workflow questions.

## 19. Performance considerations

The query route limits text context to 20 messages/12,000 characters, tool rounds to five, output to 2,048 tokens, provider time to 30 seconds, and requests to 20 per minute per user/request identity. Tool queries are bounded in several places (transactions 50, movement 100, product journey page size 100, imports 20), though some tools can scan an unbounded period before applying a row limit. Add indexed date/party/product filters and aggregate in SQL where possible. Do not pass full tables to the model. Prefer focused tool calls and summarized results with pagination metadata.

## 20–21. Testing strategy

Maintain unit tests for risk transformations, calculation boundaries, date ranges, unknown/missing data, and tool/role mapping. Add DB-backed integration tests proving returned evidence matches source rows and pagination totals. Add adversarial tests for instruction-like taxpayer/product text, forged tool-result messages, and authorization after role revocation. Use synthetic fixtures for model evaluation; do not present generated summaries as database truth. Regression coverage must continue to assert Super Admin alone cannot use taxpayer search.

## Implemented in this change

The highest-value safe improvement was to prevent the admin AI from converting missing/failed risk inputs into a confident low-risk response:

- Added `lib/ai/risk-assessment-presentation.ts`, a pure presentation boundary that labels the existing output as a system-generated review signal.
- If any factor says it could not be computed or lacks observations, the AI response now withholds the composite score/level and marks the assessment incomplete; the affected factor value is returned as unknown.
- Complete results disclose that the legacy heuristic is not statistically calibrated, does not establish fraud, uses mixed data windows, and lacks per-factor source IDs.
- Updated the RRA assistant prompt to separate facts, calculations, signals, interpretation, and unknowns, and to honor an incomplete assessment.
- Added focused tests for incomplete/completed assessment presentation and prompt behavior. Existing RBAC and score formula are unchanged.

This is deliberately scoped to the RRA AI tool response. The legacy score is still used directly by existing intelligence pages and anomaly actions; those surfaces still need a separate reviewed data-completeness/calibration change before their numeric scores can be treated as reliable. The implementation does not claim to calibrate the score or add evidence links.

## P0/P1/P2/P3 implementation roadmap

### P0 — Prevent misleading results and preserve controls

- Completed here: withhold the RRA AI composite risk score when any factor is unavailable or has insufficient observations; correct “fraud risk score” tool wording.
- Align taxpayer AI searches with access-reason requirements and verify audit details for each tool invocation.
- Fix any direct action/tool permission gaps before adding data scope; preserve the Super Admin search denial.
- Clearly disclose date windows, truncation, status filters, and incomplete historical stock/movement coverage.

### P1 — Evidence-first retrieval

- Standardize result metadata: source IDs, periods, counts, `hasMore`, calculation inputs, and data-gap flags.
- Add role-authorized, paginated date filters and complete transaction-party identities.
- Add production history and stock reconciliation retrieval that is read-only and linked to underlying records.
- Add integration tests for actual permissions, source-row matching, and missing history.

### P2 — Supply-chain and investigation workflow

- Add recorded business relationship analysis and explicitly distinguish it from inferred physical product flow.
- After B2B lifecycle validation and enablement, expose dispatch/receipt evidence with accepted/held quantity classifications.
- Build read-only investigation orchestration over existing permissioned tools with FACT/CALCULATION/SIGNAL/INTERPRETATION/UNKNOWN sections.
- Add source-record links to chat responses and keep all recommendations human-reviewed.

### P3 — Calibration and operational intelligence

- Measure risk-model quality against authorized, reviewed outcomes; version methodology and publish data coverage before exposing calibrated tiers.
- Resolve the divergence between computed and persisted risk assessments.
- Consider scheduled briefings and dashboard investigation cards with freshness, evidence coverage, reviewer status, and audit history.
- Revisit tax rules or VAT timing only through a separate policy review; this work changes none of them.

## Most Important Recommendation

**Make every investigation answer an evidence-linked, permission-filtered result with explicit coverage and data gaps.** This delivers the largest practical improvement because it makes the assistant's conclusions verifiable by an officer, reduces hallucination risk, exposes incomplete history instead of hiding it, and creates a safe foundation for deeper taxpayer, stock, production, and supply-chain analysis without bypassing RBAC.

## Verification

- The focused pure-function assertions passed through Node's native TypeScript stripping: incomplete inputs withheld the composite score/level, while complete inputs remained labeled as an uncalibrated review signal.
- The repository's normal `tsx` test runner could not start because Node's `os.userInfo()` failed with `uv_os_get_passwd returned ENOMEM`; pnpm also could not open its package-store operation lock in the sandbox.
- `tsc --noEmit` ran but the repository has existing unrelated type errors in dashboard/analytics/API components. A filtered check reported no diagnostics in the changed AI files.
- No database, migration, build, deployment, commit, push, or merge was performed.
