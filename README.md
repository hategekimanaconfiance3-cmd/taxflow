# TaxFlow Rwanda

TaxFlow is a role-based tax and supply-chain support platform for manufacturers, wholesalers, retailers, and authorized RRA staff. It is designed to improve transaction traceability, stock visibility, tax calculations, payment review, and explainable risk monitoring. It complements—not replaces—official RRA systems.

## Current application capabilities

- **Role-based business workflows:** manufacturer production, B2B sales, buyer confirmation, retailer consumer sales, inventory, tax reports, disputes, and notifications.
- **Configurable VAT calculation:** transaction creation uses the deterministic VAT engine and the configured VAT rate. Monetary totals are stored as whole RWF.
- **Tax Intelligence dashboard:** visit `/dashboard/intelligence` to review explainable alerts for stale pending transactions, transaction arithmetic, VAT calculation differences, invalid stock balances, unsettled payment submissions, price deviations, and the recorded compliance position.
- **AI business assistant:** the existing assistant uses authenticated, allow-listed read-only tools. It can explain the same risk alerts without making changes to records.
- **Payment review workflow:** authorized compliance/audit staff can open `/admin/payments` to review pending submissions. Verification requires a reference checked against independent evidence and creates an audit entry.
- **Audit evidence:** production changes, transaction confirmations, and retail sales record stock deltas and before/after quantities in audit events.
- **Existing risk and supply-chain tools:** the codebase includes price suggestions, risk scoring, revenue forecasts, behavioral analysis, and supply-chain tracing tools.

## Technology

- Next.js 16, React 19, TypeScript
- PostgreSQL via Neon Serverless and Drizzle ORM
- Better Auth for sessions and role checks
- Vercel AI SDK with configured AI providers
- Socket.IO and Redis/Valkey for real-time features
- pnpm, TypeScript, ESLint, Node test runner, GitHub Actions

## Local development

Requirements: Node.js 24 or compatible, pnpm 10+, PostgreSQL/Neon databases for TaxFlow and the separate TIN registry.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/hategekimanaconfiance3-cmd/taxflow.git
   cd taxflow
   pnpm install
   ```

2. Create a local environment file from the example:

   ```bash
   cp .env.example .env
   ```

   Set `DATABASE_URL`, `TIN_DATABASE_URL`, `BETTER_AUTH_URL`, a strong `BETTER_AUTH_SECRET`, and the provider keys/services you intend to use. Do not commit secrets. See [.env.example](.env.example) for the full list.

3. Apply the existing Drizzle schemas to your development databases:

   ```bash
   pnpm db:push:all
   ```

4. If you need demo records, use the seed scripts only against a disposable development database:

   ```bash
   pnpm db:seed:all
   ```

5. Start the application:

   ```bash
   pnpm dev
   ```

   The default local URL is http://localhost:3000.

## Quality checks

Run these before deploying:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

The GitHub Actions quality workflow is intended to run the same checks for pull requests and pushes.

## Important limitations and trust boundaries

- The TIN registry schema is currently a separate mock/demo registry unless an authorized live data source has been configured. This repository does **not** by itself prove a live RRA integration.
- The Tax Intelligence dashboard uses deterministic review rules. Alerts are not findings of fraud, legal advice, or official tax assessments.
- Current-rate VAT checks may flag older transactions because applicable tax-rule versions are not yet persisted on each transaction.
- The payment review screen is a manual authorized workflow, not a payment gateway or bank integration. An officer must independently verify settlement evidence before confirming a submission.
- Stock movement evidence is written to the append-only audit log; this is not yet a separate normalized stock-ledger table, and historical events may not contain the newer movement details.
- Import invoice PDFs are stored outside `public/` and served only to the owning trader and active RRA reviewers. Configure `TAXFLOW_PRIVATE_UPLOAD_DIR` to a persistent private volume when deploying; local filesystem storage must be shared by app instances that serve uploads.
- VAT rounding, exemptions, refunds, credit notes, mixed-rate invoices, and official filing treatment require review by qualified tax/accounting specialists before production use.
- Do not use seeded demo data for real tax decisions. Do not expose production taxpayer data to AI providers without an approved legal basis, privacy review, and retention policy.

## Project documentation

- [AI intelligence and trust controls](docs/AI-INTELLIGENCE-AND-TRUST-CONTROLS.md)
- [Tax engine](lib/intelligence/tax-engine.ts)
- [Explainable risk rules](lib/intelligence/risk-rules.ts)
- [Supply-chain reconciliation helpers](lib/intelligence/reconciliation.ts)
