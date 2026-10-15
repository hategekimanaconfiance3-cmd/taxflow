# TaxFlow Rwanda: AI Intelligence and Trust Controls

## Scope and status

This document describes the current implementation and the remaining production-hardening plan for TaxFlow's existing application. The deterministic VAT engine is now used by B2B and retailer sale creation; the explainable risk rules feed the trader-scoped Tax Intelligence dashboard and the existing AI assistant; production increments and stock changes are recorded with append-only audit evidence; and authorized RRA compliance/audit staff have a manual payment-verification queue. The standalone pair-reconciliation helpers are still building blocks and are not yet wired to a persisted buyer receipt ledger. No live RRA, bank, or payment-provider integration is implied. Existing routes must continue to validate authorization, transaction status, applicable tax configuration, and database consistency.

## 1. Core principles

- RRA remains authoritative for official taxpayer registration, tax rules, assessments, and payment status.
- TaxFlow must distinguish mock/test data from data obtained through an authorized live integration.
- Deterministic application code calculates amounts; generative AI explains the results.
- Risk alerts are review signals, not fraud findings or automatic enforcement decisions.
- Every sensitive change should have an attributable, append-only audit record.
- Taxpayer data is only available to authenticated users with a verified need to access it.

## 2. Tax calculation engine

Use `lib/intelligence/tax-engine.ts` for whole-RWF VAT calculations. Inputs specify the amount, pricing mode (inclusive or exclusive), and rate in basis points. Retrieve the applicable rate and pricing convention from trusted, versioned tax configuration. Do not hard-code one rate for every transaction.

Before production use, accounting and tax specialists must approve the rounding policy and verify handling for exemptions, zero-rated supplies, refunds, credit notes, mixed-rate invoices, and line-level versus invoice-level rounding.

## 3. Supply-chain and stock reconciliation

Use `lib/intelligence/reconciliation.ts` as a starting point for:
- Matching dispatches with buyer receipts.
- Flagging missing receipts, identity mismatches, quantity differences, and amount differences.
- Reconstructing stock from opening balances and referenced movements.
- Producing explainable baseline-deviation alerts.

Integrate these functions with persisted, authorized records in a database transaction. Use stable transaction references and avoid treating fuzzy matches as confirmed matches. Store the evidence, rule version, timestamp, and review outcome for every alert.

## 4. AI assistant architecture

The assistant should:
1. Authenticate the requester and apply row-level business permissions.
2. Translate the question into a narrow, allow-listed data query or approved tool call.
3. Fetch only the minimum required records.
4. Use deterministic functions for money, tax, totals, and reconciliations.
5. Respond with a plain-language explanation, reporting period, calculation breakdown, and source transaction references.
6. Say when records are incomplete or data is unavailable.
7. Log sensitive access and prevent the model from changing payments, roles, official records, or tax rules.

Do not pass raw database credentials, authentication secrets, unnecessary national IDs, or full taxpayer datasets to an AI provider. Redact prompts and logs according to an approved retention policy.

## 5. RRA risk dashboard

Recommended fields for each alert:
- Rule identifier and version.
- Business and transaction references, limited to authorized viewers.
- Observed and expected values.
- Difference and severity.
- Evidence links and missing information.
- Human review status, reviewer, and disposition.

Start with transparent rules. Train machine-learning models only after collecting lawful, representative, validated data and evaluating false-positive rates, bias, drift, and explainability.

## 6. Payments and accounting

Payment records should remain pending until independently verified evidence confirms settlement. Verify amount, currency, payee, external reference, and provider signature. Process duplicate callbacks idempotently. Reconcile bank/provider statements and record reversals as linked adjustment entries; do not silently overwrite confirmed payment history.

A recorded payment is not automatically the same as a tax liability reduction. Define an explicit, authorized allocation and reconciliation process.

## 7. Manufacturer production controls

Record production batches, raw material usage where applicable, finished quantities, dispatches, returns, losses, and stock adjustments. Require reasons and supporting evidence for material corrections. Compare manufacturer dispatch records with wholesaler receipts and flag discrepancies. Risk scoring should prioritize human review rather than automatically penalize businesses.

## 8. Release gates

Before a pilot:
- Pass type checking, linting, unit tests, and production build.
- Test authorization for each role and each sensitive action.
- Test concurrency, retries, stock consistency, rounding, refunds, and payment reconciliation.
- Complete a threat model, privacy review, backup restoration test, and incident-response plan.
- Confirm legal basis and written authorization for any RRA integration.
- Run a limited pilot with independently verified samples and publish measured results.

## 9. Metrics

Track transaction match rate, stock-count variance, payment reconciliation rate, false-positive rate, alert review time, system availability, and user adoption. Report the sample size and methodology; do not present unvalidated estimates as measured outcomes.
