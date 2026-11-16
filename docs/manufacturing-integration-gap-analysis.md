# TaxFlow Manufacturing Integration Gap Analysis

## Scope and conclusion

This report began as a Stage 1 audit of the existing TaxFlow platform against the beverage-manufacturing integration prompt and now records the incremental implementation progress. The repository already contains a substantial manufacturer production and raw-material accounting workflow. The independent industrial evidence plane has a working foundation, while external connectors, mTLS, durable replay operations, and broad cross-source verification remain open.

The implementation should extend the current `production_batch`, recipe, material-accounting, stock-movement, AI-finding, notification, and RBAC workflows. It should not replace them or allow telemetry to post finished-goods stock automatically.

## Existing capability inventory

### Fully or substantially implemented

- Manufacturer-scoped product registration and production recording.
- Versioned, immutable manufacturer recipes and recipe-material usage.
- Confidential material codes and names, with dedicated formula permissions for staff views.
- Raw-material plans, receipts, reservations, exact fixed-point material movements, review, and adjustment workflows.
- Finished-goods stock updates through authorized production review, with append-only stock movements and audit entries.
- B2B reservations, buyer acceptance, dispatch/receipt evidence, retail sales, VAT snapshots, invoices, and payment review.
- Better Auth sessions, server-side trader/RRA guards, fine-grained RRA permissions, audit logging, and rate limiting.
- Persistent AI findings, deterministic reconciliation rules, production-history comparisons, finding routing, notifications, and periodic monitoring scans.
- Private import-invoice access and correction-evidence workflows.

### Partially implemented

- Factory, production-line, equipment, calibration, gateway, and industrial-event registration are now implemented as an evidence-plane foundation: manufacturer-owned records, beverage stage templates, lifecycle transitions, officer review, and audit entries are available. External machine connectivity is intentionally not fabricated.
- Production is a declaration workflow; independent evidence is limited to TaxFlow's own ledger, verified material receipts, historical declarations, and rule-based comparisons.
- Batch output supports good/rejected quantities and now has separate machine evidence plus stage-by-stage history, but verification currently compares machine quantity with the declared batch quantity rather than all downstream sources.
- Stock and material ledgers are append-only, but there is no factory, warehouse-location, or production-line ownership dimension.
- AI monitoring is continuous at the application scheduler level, but industrial evidence has not yet been wired into the existing AI finding and case-routing workflows.
- Officer routing exists by finding type and permission, but manufacturing-specific case assignment, investigation deadlines, evidence review, escalation, and resolution history are not a dedicated workflow.
- Offline support now includes authenticated event acknowledgements, sequence/gap statuses, and a deterministic simulator buffer; it is not yet a durable, deployable gateway buffer with retry/dead-letter operations.

### Not implemented

- Production hardware connectors for OPC UA, Modbus, industrial Ethernet, vendor APIs, ERP/MES, SCADA, or historians.
- Mutual TLS/certificate issuance, a separately deployable edge gateway, and production-grade offline replay orchestration.
- Full independent comparisons against ERP/MES, finished-goods dispatch, sales, and recipe/material movement sources.
- Formal case assignment, escalation, exception approval, and compliance notification workflows.

## Incremental implementation delivered in this change

- `factory`, `factory_production_line`, and `factory_production_stage` tables are tenant-scoped to the manufacturer and linked to `production_batch` through nullable factory/line references.
- Manufacturer routes and dashboard support draft factory registration, line registration, standard beverage stages, and submission for review.
- Officer routes and dashboard support permission-gated onboarding transitions and required review notes. Reviews are written to `auditLog`; they do not create stock, tax, or official approval records outside the factory onboarding state.
- Migration: `db/migrations/taxflow/0036_factory_registration_and_production_lines.sql`, with the migration journal updated to include the existing `0035` migration and the new `0036` migration.
- Tests cover the registration schema's paired coordinate/capacity validation, duplicate stage rejection, and ordered beverage-stage input. Runtime test/type/build execution remains pending until the Node/pnpm toolchain is available.
- Equipment registration and append-only calibration records are tenant-scoped and audit-backed; equipment is linked to a registered factory and line.
- Gateway enrollment issues a one-time secret, stores only its hash, supports rotation/revocation, heartbeat records, and RRA activation. The secret is never returned by list/read APIs.
- `/api/v1/industrial/events` and `/api/v1/industrial/heartbeat` provide a validated, rate-limited contract. Accepted events preserve original and normalized payloads, payload hashes, sync acknowledgements, sequence gaps/out-of-order events, and counter resets.
- A simulator and offline buffer generate explicitly `simulator`-sourced beverage events, including stage completion, discrepancies, and counter resets. Simulator data is marked separately from real gateway evidence.
- Existing `production_batch` rows are reused. Industrial evidence is stored separately in batch evidence and stage-history records; verification compares machine quantity with declared quantity and creates reviewable alerts without posting stock, tax, or approval state.
- A configurable factory integration policy and compliance-incident model provide a non-compliance foundation; enforcement decisions remain policy-controlled.
- Manufacturer industrial management and RRA industrial monitoring pages expose the new registries, gateway health, event counts, verification backlog, and discrepancy counts.

## Remaining implementation dependencies

- Build and deploy the edge gateway/connector service, then add OPC UA, Modbus, vendor API, ERP/MES, SCADA, and historian adapters one at a time behind the validated event contract.
- Replace bearer-secret-only gateway authentication with mTLS/certificate lifecycle management where the deployment supports it, and add secure gateway software-update controls.
- Add a durable replay worker and operational retry/dead-letter handling around synchronization acknowledgements; the current offline buffer is a deterministic simulator/client primitive.
- Extend verification to recipe/material consumption, finished-goods movements, dispatch, sales, gateway health, inactive-equipment production, missing events, rollover, and authorized exception workflows.
- Add RRA investigation case assignment/escalation and manufacturer-facing compliance history, calibration screens, event history, and verification detail views.
- Validate migrations on a disposable database and run the full test/typecheck/lint/build suite after the Node/pnpm toolchain is installed.

## Reuse map for implementation

| New capability | Existing TaxFlow boundary to extend | Required boundary |
| --- | --- | --- |
| Factory onboarding | `user`, `rraStaff`, `auditLog`, existing admin action/page conventions | New factory and onboarding records; owner-scoped service and officer review workflow |
| Production-line mapping | `productionBatch`, `product`, existing manufacturer production page | New factory-line-stage records; batches reference factory/line without changing historical rows |
| Equipment registry | Existing RRA permissions, audit, notifications | New equipment/calibration records and critical-equipment lifecycle rules |
| Gateway management | `rraStaff`, `notification`, `rateLimit`, `realtime` | New gateway/device-credential/connection records; certificates and revocation stay server-side |
| Industrial events | `productionBatch`, `productionHistoryComparison`, append-only movement patterns | New immutable raw and normalized event tables with unique event identity and sequence constraints |
| Verification | `aiFinding`, `productionHistoryComparison`, `production-declaration-monitor.ts` | New source-aware reconciliation result/case records; findings remain advisory until review |
| Alert routing | `finding-router.ts`, `aiFinding`, `notification`, RRA permissions | Add manufacturing permissions and dedicated assignment/escalation state |
| Manufacturer UI | `/dashboard/production` and production services | Add factory, integration-health, evidence, and explanation views without exposing officer-only data |
| Officer UI | existing production material-accounting and manufacturing-activity pages | Add real registry/event/verification workspaces backed by real queries |

## Recommended implementation stages

1. Add factory, production-line, and onboarding lifecycle models with owner/officer authorization and audit tests.
2. Add equipment and calibration models, then gateway enrollment/health/revocation records.
3. Add versioned industrial event storage and authenticated ingestion with idempotency, ordering, integrity, and raw-payload retention.
4. Add offline synchronization records and a simulator before connecting any real hardware.
5. Link events to existing batches and recipes as evidence only; never post stock from telemetry automatically.
6. Add source-aware verification cases and configurable tolerances using protected material references.
7. Add manufacturing-specific AI rules/statistics and officer assignment/escalation.
8. Add manufacturer and officer workspaces, then run the complete existing and new test suites.

## Release blockers found during audit

- Rotate and remove live database credentials embedded in `scripts/*.mjs` before any deployment or further sharing.
- Remove the known fallback `BETTER_AUTH_SECRET`; production startup must fail closed when the secret is absent or weak.
- Remove the predictable Redis/Valkey fallback credential from runtime code.
- Keep seed credentials restricted to explicitly disposable development databases; never run the password-reset utility against production.
- Install the declared Node/pnpm toolchain and dependencies, then run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. This checkout currently has no `node_modules`, and the inspection environment has no Node executable, so those checks could not be executed here.
- Resolve the existing migration-history complexity and verify the actual target database before adding industrial migrations. The journal contains two entries whose filenames begin with `0009`; they are separately journaled but should be validated with the target Drizzle version and a disposable database.

## Trust-boundary limitations

- The TIN database is described as a mock/demo registry unless a live authorized source is configured.
- Current AI and deterministic alerts are review signals, not fraud findings or official tax assessments.
- No real factory hardware, gateway, RRA EBM/VSDC integration, bank settlement integration, or certified fiscal-device integration is present in this repository.
- Industrial evidence must be retained separately from manufacturer declarations and must not be allowed to overwrite historical declarations, recipes, batches, stock, or audit records.
