# TaxFlow localization coverage report

## Scope inspected

- Existing locale catalog and browser translation runtime: `lib/language.ts` and `components/providers/language-runtime.tsx`.
- Preference persistence and dashboard selectors: `lib/use-language.ts`, `components/dashboard/dashboard-layout-client.tsx`, and `components/admin/admin-shell/admin-shell.tsx`.
- AI request path and system prompts: `app/api/ai/query/route.ts` and `lib/ai/system-prompts.ts`.
- Application route groups and shared component areas under `app/` and `components/` were inventoried. The full text of every route, email, generated report, or PDF was not exhaustively reviewed.

## Architecture and changes

- Reused the centralized English-keyed catalog and existing DOM translation runtime. No localization dependency was added.
- The public locale codes are now `en`, `rw`, and `fr`. Existing `kiny` local-storage/cookie preferences are normalized to `rw` so saved preferences continue to work.
- The selected preference continues to persist in local storage and a non-sensitive language cookie, survives refresh/navigation, and sets the document language to `en`, `rw`, or `fr`.
- Added shared glossary entries and additional Kinyarwanda/French copy for authentication, restock requests, common AI assistant controls/suggestions, and notifications. Existing catalog entries already cover many navigation, dashboard, tax, stock, transaction, and administration labels.
- The AI query route reads the locale cookie server-side and instructs the model to use that language by default. An explicit language request can override the preference for that answer. The prompt preserves identifiers, figures, evidence, and official decision labels.
- Added focused tests for locale codes, legacy preference normalization, translation fallback, and unread-notification counts.

## Coverage status

This is an incremental localization enhancement, not a claim of complete application translation. The existing runtime translates exact catalog matches in rendered text and selected attributes (`placeholder`, `title`, and `aria-label`). Uncatalogued text falls back to English.

Remaining work includes:

- Review and catalog every hardcoded string across public/auth pages, all trader and RRA routes, Super Admin tools, forms, validation errors, dialogs, empty/loading/error states, and support workflows.
- Add locale-aware formatting for dates, numbers, and currencies in screens and exports. Stored values and financial calculations must remain unchanged.
- Localize server-generated email templates, persisted notification copy, downloadable reports, and PDF documents; these do not receive browser DOM translation.
- Review third-party identity, payment, and embedded-provider screens for localization support.
- Validate Kinyarwanda and French terminology with a qualified reviewer, especially legal and tax language.
- Add plural/interpolation-aware message resources and replace exact-string DOM translation where components require structured messages.

## Files changed

- `lib/language.ts`
- `lib/use-language.ts`
- `components/providers/language-runtime.tsx`
- `app/api/ai/query/route.ts`
- `tests/language.test.ts`
- `docs/localization-coverage.md`

No dependency, database, tax, inventory, or authorization changes were made. Tests, typecheck, lint, build, and migrations were not run as requested.
