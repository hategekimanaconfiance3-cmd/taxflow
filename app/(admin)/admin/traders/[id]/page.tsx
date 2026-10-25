import { requireRRAOperationalPermission } from '@/lib/auth-guard';
import { getTraderLookupById } from '@/lib/actions/admin-tin-lookup.action';
import { TraderLookupDetails } from '@/components/admin/tin-taxpayer-lookup';
import { AdminClearanceActions } from '@/components/admin/admin-clearance-actions';
import { EditTaxpayerDialog } from '@/components/admin/edit-taxpayer-dialog';
import { hasOperationalRRAPermission } from '@/lib/rra-rbac';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TinTaxpayerAssistant } from '@/components/admin/tin-taxpayer-lookup';

export default async function AdminTraderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const rraSession = await requireRRAOperationalPermission("taxpayer.intelligence.search");
  const { id } = await params;
  const trader = await getTraderLookupById(id);
  if (!trader) notFound();
  const canEditProfile = hasOperationalRRAPermission(rraSession.staff.clearanceRoles, "taxpayer.profile.update");
  const canUpdateClearance = hasOperationalRRAPermission(rraSession.staff.clearanceRoles, "taxpayer.clearance.update");
  const roles = rraSession.staff.clearanceRoles;
  const tin = trader.profile.tinNumber ?? "";
  const query = encodeURIComponent(tin);
  const workflowLinks = [
    hasOperationalRRAPermission(roles, "transaction.read") && { label: "Transactions", href: `/admin/transactions?search=${query}` },
    (hasOperationalRRAPermission(roles, "payments.read") || hasOperationalRRAPermission(roles, "payments.reconcile")) && { label: "Payments", href: `/admin/payments?tin=${query}` },
    (hasOperationalRRAPermission(roles, "imports.read") || hasOperationalRRAPermission(roles, "imports.review")) && { label: "Import declarations", href: `/admin/imports?tin=${query}` },
    (hasOperationalRRAPermission(roles, "stock.read") || hasOperationalRRAPermission(roles, "traceability.read")) && { label: "Stock monitoring", href: `/admin/stock?tin=${query}` },
    hasOperationalRRAPermission(roles, "traceability.read") && { label: "Product journey", href: `/admin/product-journey?query=${query}` },
    (hasOperationalRRAPermission(roles, "compliance.followup.manage") || hasOperationalRRAPermission(roles, "investigation.case.manage")) && { label: "Cases and taxpayer follow-up", href: `/admin/cases?tin=${query}` },
    hasOperationalRRAPermission(roles, "support.read") && { label: "Support requests", href: `/admin/support?tin=${query}` },
    hasOperationalRRAPermission(roles, "investigation.case.manage") && { label: "Disputes", href: `/admin/disputes?tin=${query}` },
  ].filter((item): item is { label: string; href: string } => Boolean(item));
  const sections = [
    { id: "profile", label: "Profile", available: true },
    { id: "tax-vat", label: "Tax and VAT", available: Boolean(trader.financial) },
    { id: "transactions", label: "Transactions", available: Boolean(trader.transactions) },
    { id: "production", label: "Production", available: Boolean(trader.production) },
    { id: "imports", label: "Imports", available: Boolean(trader.imports) },
    { id: "stock", label: "Stock", available: Boolean(trader.stock) },
    { id: "corrections", label: "Stock corrections", available: Boolean(trader.corrections) },
    { id: "payments", label: "Payments", available: Boolean(trader.payments) },
    { id: "support", label: "Support", available: Boolean(trader.supportRequests) },
    { id: "disputes", label: "Disputes", available: Boolean(trader.disputes) },
    { id: "cases", label: "Cases", available: Boolean(trader.cases) },
    { id: "audit-history", label: "Audit history", available: Boolean(trader.auditHistory) },
  ].filter((section) => section.available);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxpayer workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">TIN {trader.profile.tinNumber} · Record details and operations available to your assigned roles.</p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/traders">Search another TIN</Link></Button>
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Permitted taxpayer operations</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canEditProfile && trader.profile.email !== undefined && <EditTaxpayerDialog
            traderId={trader.profile.id}
            currentName={trader.profile.name}
            currentBusinessName={trader.profile.businessName}
            currentPhone={trader.profile.phoneNumber ?? null}
            currentEmail={trader.profile.email}
          />}
          {canUpdateClearance && <AdminClearanceActions
            traderId={trader.profile.id}
            traderName={trader.profile.businessName ?? trader.profile.name}
            currentStatus={trader.profile.clearanceStatus ?? "unknown"}
          />}
          {workflowLinks.map((item) => <Button key={item.href} asChild variant="outline" size="sm"><Link href={item.href}>{item.label}</Link></Button>)}
          {!canEditProfile && !canUpdateClearance && workflowLinks.length === 0 && <p className="text-sm text-muted-foreground">Your assigned roles do not authorize a taxpayer change or linked operation for this record.</p>}
        </CardContent>
      </Card>
      <nav aria-label="Taxpayer record sections" className="flex flex-wrap gap-2 rounded-lg border p-3">
        {sections.map((section) => <a key={section.id} href={`#${section.id}`} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">{section.label}</a>)}
      </nav>
      <TraderLookupDetails result={trader} />
      {tin && <TinTaxpayerAssistant tin={tin} />}
    </div>
  );
}
