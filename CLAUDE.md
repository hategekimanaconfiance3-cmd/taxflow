# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TaxFlow is an enterprise-grade tax compliance and management platform for Rwanda (RRA — Rwanda Revenue Authority). It supports multi-role workflows for Manufacturers, Wholesalers, Retailers, and RRA Staff.

## Commands

```bash
# Development
pnpm dev              # Custom server (tsx server.ts) with Socket.io — use this, not next dev
pnpm dev:next         # Direct Next.js dev (no Socket.io real-time)

# Build & Production
pnpm build
pnpm start            # Production server (tsx server.ts)

# Database
pnpm db:push          # Push schema to main DB
pnpm db:push:tin      # Push schema to TIN registry DB
pnpm db:push:all      # Both databases
pnpm db:studio        # Open Drizzle Studio UI
pnpm db:seed          # Seed all databases

# Code Quality
pnpm lint             # ESLint
pnpm tsc --noEmit     # Type check (used in CI)
```

## Architecture

### Dual Database Setup
- **Main DB** (`DATABASE_URL`): All application data — configured in `drizzle.taxflow.config.ts`, schema at `db/schema.ts`
- **TIN Registry DB** (`TIN_DATABASE_URL`): Read-only government citizen/business registry — configured in `drizzle.tin.config.ts`, schema at `db/tin-schema.ts`

### Authentication & Authorization
- `better-auth` with Drizzle adapter (`lib/auth.ts`)
- Route protection is handled by server-side guard functions in `lib/auth-guard.ts`: `requireTraderSession()` and `requireAdminSession()`
- These guards are called at the top of layout server components (`app/(dashboard)/layout.tsx`, `app/admin/layout.tsx`)
- Auth API routes are at `app/(api)/api/auth/[...all]/route.ts`

### Real-time System
- Custom HTTP server (`server.ts`) wraps Next.js and mounts Socket.io on the same port
- Valkey (Redis-compatible) pub/sub via `lib/realtime.ts` enables multi-server event emission
- `lib/socket-server.ts` initializes the Socket.io server with Valkey adapter
- Client hook: `lib/socket-client.ts` → `useSocket()`
- Socket context provider: `components/providers/socket-provider.tsx`

### App Router Structure
```
app/
├── page.tsx              # Root redirect based on session role
├── (auth)/               # Auth routes (sign-in, sign-up, OTP, password reset)
│   └── (admin)/          # Admin login only
├── (dashboard)/          # Trader dashboard — protected by requireTraderSession()
│   └── dashboard/        # sales, sell, inventory, payments, disputes, tax, production, etc.
├── admin/                # RRA admin — protected by requireAdminSession()
│   └── dashboard/        # traders, transactions, payments, compliance, reports, intelligence, audit, etc.
└── api/                  # Route handlers for AI endpoints, admin APIs, file upload
```

### Server Actions
All mutations go through server actions in `lib/actions/`. Named by domain:
- `auth.action.ts` — sign-in, sign-up, OTP, session
- `sales.action.ts`, `imports.action.ts`, `disputes.action.ts`, `payments.action.ts` — trader operations
- `admin-*.action.ts` files — RRA staff operations

### AI Integration
Multiple models are used in `lib/ai/`:
- **Anthropic Claude** — behavioral analysis, smart audit
- **Google Gemini** — revenue forecasting, intelligence chat
- **HuggingFace / DeepSeek** — risk scoring
- **Vercel AI SDK** — unified streaming interface

### Components
- `components/ui/` — shadcn/ui primitives (New York style, Tailwind v4)
- `components/dashboard/` — trader-facing feature components
- `components/admin/` — RRA staff feature components
- `components/auth/` — auth forms
- `components/shared/` — cross-role components (AI chat widget)

## Engineering Rules (Non-Negotiable)

**Financial correctness over convenience.** All code touching tax calculations, payments, balances, or filings must be deterministic, transactional, logged, and reviewed.

### Multi-step writes require transactions
```ts
await db.transaction(async (tx) => {
  await tx.insert(transactions).values(txData)
  await tx.insert(auditLog).values(logEntry)
})
```

### Every critical mutation needs an audit record
Audit logs must include: `userId`, `action`, `targetId`, `metadata`, `ipAddress`, `timestamp`.

### Validation: always twice
- Client side with `react-hook-form` + `zodResolver` (UX)
- Server side with `zod.safeParse()` in server actions (security)

### TypeScript
- Strict mode stays on. No `any`. No `@ts-ignore` without a documented reason.
- Explicit return types on all exported functions.

### Database access
- DB logic must stay server-side only. Never import DB or schema into client components.
- Always handle null results. Never fire-and-forget DB calls.
- Use `db.transaction()` for any workflow touching more than one table.

### Error handling
- Never swallow errors silently. Always propagate to the UI layer.
- Never expose raw DB errors to clients — return safe, user-friendly messages.

### PR titles
Imperative, no conventional commit prefixes: `"Add taxpayer registration flow"` not `"feat: add taxpayer registration flow"`.

## Key Environment Variables

```
DATABASE_URL           # Main Neon PostgreSQL
TIN_DATABASE_URL       # TIN registry Neon PostgreSQL (read-only)
BETTER_AUTH_SECRET     # Auth signing secret
BETTER_AUTH_URL        # Auth base URL
NEXT_PUBLIC_APP_URL    # Client-side base URL
REDIS_URL              # Valkey for Socket.io adapter
ANTHROPIC_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
HUGGINGFACE_API_KEY
DEEPSEEK_API_KEY
RESEND_API_KEY         # Transactional email
BLOB_READ_WRITE_TOKEN  # Vercel Blob storage
```
