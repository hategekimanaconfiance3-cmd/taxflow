import { requireRRAPermission } from "@/lib/auth-guard";
import { listPriceAlerts } from "@/lib/price-monitoring-service";
import { PriceAlertWorkspace } from "@/components/admin/price-alert-workspace";

export const dynamic = "force-dynamic";

export default async function PriceAlertsPage() {
  const { staff } = await requireRRAPermission("price.alert.read");
  const alerts = await listPriceAlerts(staff, {});
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Price-change alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review recorded merchant price movements within your authorized scope.</p>
      </div>
      <PriceAlertWorkspace initialAlerts={alerts} />
    </div>
  );
}

