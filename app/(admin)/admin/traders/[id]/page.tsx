import { requireRRAPermission } from '@/lib/auth-guard';
import { getTraderLookupById } from '@/lib/actions/admin-tin-lookup.action';
import { TraderLookupDetails } from '@/components/admin/tin-taxpayer-lookup';
import { AdminClearanceActions } from '@/components/admin/admin-clearance-actions';
import { EditTaxpayerDialog } from '@/components/admin/edit-taxpayer-dialog';
import { hasOperationalRRAPermission } from '@/lib/rra-rbac';
import { notFound } from 'next/navigation';

export default async function AdminTraderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const rraSession = await requireRRAPermission("taxpayer.intelligence.search");
  const { id } = await params;
  const trader = await getTraderLookupById(id);
  if (!trader) notFound();
  const canEditProfile = hasOperationalRRAPermission(rraSession.staff.clearanceRoles, "taxpayer.profile.update");
  const canUpdateClearance = hasOperationalRRAPermission(rraSession.staff.clearanceRoles, "taxpayer.clearance.update");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trader information</h1>
        <p className="text-muted-foreground text-sm mt-1">Information shown is limited to your RRA role.</p>
      </div>
      {(canEditProfile || canUpdateClearance) && <div className="flex flex-wrap justify-end gap-2">
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
      </div>}
      <TraderLookupDetails result={trader} />
    </div>
  );
}
