import { requireRRAPermission } from '@/lib/auth-guard';
import { TaxpayerIntelligenceSearch } from '@/components/admin/taxpayer-intelligence-search';

/**
 * Taxpayer Intelligence Search
 *
 * Authorization: requires `taxpayer.intelligence.search` permission.
 * This permission is intentionally NOT granted to super_admin — only to
 * roles with explicit taxpayer data access (tax_compliance_officer,
 * audit_investigation_officer, etc.).
 *
 * The rendering error previously seen ("An error occurred in the Server
 * Components render") was caused by a client component attempting to fetch
 * Rwanda administrative location data from an API route that does not exist
 * in this codebase. That component has been replaced with this redesigned
 * search interface which uses only the existing DB-backed server action.
 */
export default async function AdminTradersPage() {
  // Server-side auth — redirects to /admin/dashboard on insufficient permission.
  // Denial is written to the audit_log before redirecting.
  await requireRRAPermission('taxpayer.intelligence.search');

  return (
    <div className="space-y-6 p-6">
      <TaxpayerIntelligenceSearch />
    </div>
  );
}
