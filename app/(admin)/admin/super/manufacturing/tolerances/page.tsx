import { requireRRAPermission } from '@/lib/auth-guard';
import { listProductionToleranceGovernance } from '@/lib/production-tolerance-service';
import { ProductionToleranceGovernance } from '@/components/admin/super/production-tolerance-governance';

export default async function SuperAdminManufacturingTolerancesPage() {
  const { user, staff } = await requireRRAPermission('production.tolerance.govern');
  if (!staff.clearanceRoles.includes('super_admin')) return null;
  const data = await listProductionToleranceGovernance(user.id);
  return <div className="space-y-5">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Manufacturing Standards</h1>
      <p className="mt-1 text-sm text-muted-foreground">Super Admin-only tolerance governance. Standards require evidence, justification, approval, activation, and an effective date.</p>
    </div>
    <ProductionToleranceGovernance data={data} />
  </div>;
}
