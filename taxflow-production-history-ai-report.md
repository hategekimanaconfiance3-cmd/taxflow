# TaxFlow Production History Intelligence — Implementation Report

## Summary

Added a read-only historical production comparison to the existing RRA Intelligence Assistant and product journey. It calculates a deterministic, recipe-version-specific baseline from prior production batches already recorded as `independently_supported` and `within_tolerance`. It reports evidence and data limitations, and labels deviations as review signals rather than findings of fraud or official determinations.

This is data-driven statistical comparison, not model training or persistent learning of manufacturer formulas by Gemini. Baselines are recalculated from eligible TaxFlow records when requested.

## Existing architecture used

- RRA AI requests run through `app/api/ai/query/route.ts`, which authenticates the session, resolves verified staff roles, and filters available tools server-side.
- AI tools are defined in `lib/ai/tools/rra-tools.ts`; role-to-permission gating is centralized in `lib/ai/rra-tool-access.ts`; guidance is in `lib/ai/system-prompts.ts`.
- Confidential recipe, material, and batch-usage records already exist in the production schema. They are read only by the new server-side analyzer.
- Persistent review findings use the existing `ai_finding`, `ai_audit_log`, and `audit_log` records and status workflow.

## What changed

- Added `lib/ai/production-history-baseline.ts`: median and median absolute deviation comparisons, a minimum of five eligible prior batches, confidence bands based on sample count, and explicit missing-evidence/insufficient-history states. Output yield uses the recipe’s configured yield tolerance. Material-use comparisons use historical dispersion only because the schema has no separate material tolerance.
- Added `lib/ai/production-history-service.ts`: bounded targeted reads for up to five candidate batches, up to 50 earlier verified batches per exact recipe version, recipe material records, and recorded material usage. The joins verify manufacturer and product ownership. If evidence reads reach a hard cap, anomaly comparisons are suppressed and the limitation is reported.
- Added the `getProductionHistoryAnalysisTool` to the existing RRA assistant. It is exposed only through `production.formula.read`, with the existing `super_admin` exclusion preserved.
- Added an authorized API endpoint for the product journey and finding detail views. It checks permission on the server and derives the manufacturer TIN from the selected batch, not from the client request.
- Added a bounded manual “Scan Production History” action. It evaluates up to 25 recent recipe-linked batches, stores only a redacted review finding, and records the scan in the existing AI and audit logs. Finding IDs are stable per rule version and batch, making repeated scans idempotent.
- Added production finding detail/review controls and restricted evidence loading. Production resolution notes are hidden from users lacking the formula permission; audit entries store note metadata/hash rather than confidential note text.
- Added focused baseline and tool-access tests. **They were not run**, as requested.

## Data, evidence, and interpretation

- Candidate metrics are actual/planned finished output and actual/planned usage for each recipe material.
- Historical samples must use the same immutable recipe version, end no later than the candidate batch, have status `independently_supported`, and have validation status `within_tolerance`.
- Baseline center is the median. The statistical spread threshold is three times the median absolute deviation. For output yield, the configured recipe yield tolerance is also applied. A zero material MAD produces a zero statistical threshold; this can generate a review lead for any observed deviation and should be monitored during human review.
- Evidence includes batch references, sample counts, the rule version, and data limitations. Missing or incomplete usage is reported as missing evidence rather than imputed.
- Statistical signals are not proof of wrongdoing, independently verified physical production, tax liability, or an RRA decision.

## Authorization and privacy

- The assistant tool and API both enforce `production.formula.read` server-side. Client masking is not relied upon.
- The new tool is unavailable to `super_admin` by default, consistent with the existing AI tool policy.
- Material names and quantities are returned only to explicitly authorized formula readers. Generic stored findings contain batch references, coarse metric codes, and baseline references, not ingredient names or quantities.
- Generic finding reads redact production evidence references and reviewer notes unless the caller has the formula permission. Formula-bearing evidence is fetched separately through the permission-checked API.
- Recipe joins are constrained to the batch manufacturer and product; material joins are constrained to the same manufacturer.
- No write/action capability was added to the AI assistant. The scan writes a review finding through the existing auditable server action; it does not change production, stock, VAT, or batch status.

## Limitations and follow-up

1. **Verified-history provenance is the main dependency.** Existing records use the `independently_supported` status, but this change does not establish or change that status. The baseline is only as trustworthy as the process that assigns it. A separately authorized, evidence-based review workflow should be defined before treating these baselines as reliable.
2. “Independently supported” and “within tolerance” are existing database labels, not independent proof that physical production occurred. The tool states this limitation.
3. The analysis only covers recipe-linked batches with recorded planned and actual quantities. Legacy batches are not assigned fabricated recipe evidence.
4. Candidate scans are manual and capped at 25 recent records; this is not a scheduled monitoring system. The assistant query is bounded but may still perform multiple targeted reads.
5. Comparisons are within an exact recipe version. They do not currently model seasonality, equipment, shifts, supplier lots, waste categories, or changes between recipe versions.
6. There is no new migration or schema change in this implementation.

## Files changed

- `lib/ai/production-history-baseline.ts`
- `lib/ai/production-history-service.ts`
- `lib/ai/tools/rra-tools.ts`
- `lib/ai/rra-tool-access.ts`
- `lib/ai/system-prompts.ts`
- `app/api/ai/query/route.ts`
- `app/api/admin/production/history/route.ts`
- `lib/actions/ai-finding.action.ts`
- `app/(admin)/admin/intelligence/page.tsx`
- `components/admin/intelligence-action-buttons.tsx`
- `app/(admin)/admin/intelligence/findings/page.tsx`
- `app/(admin)/admin/intelligence/findings/[id]/page.tsx`
- `components/admin/finding-review-controls.tsx`
- `components/admin/production-history-finding-evidence.tsx`
- `components/admin/product-journey-explorer.tsx`
- `tests/production-history-baseline.test.ts`
- `tests/ai-evaluation.test.ts`

## Verification

- `git diff --check` completed successfully.
- Tests, typecheck, lint, build, and migrations were **not run**, per instruction. No commit, push, or deployment was performed.
- After reviewing the implementation, run the following locally:

```powershell
pnpm exec tsx --test tests/production-history-baseline.test.ts
pnpm exec tsx --test tests/ai-evaluation.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

No migration command is needed for this change.
