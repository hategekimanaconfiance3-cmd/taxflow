import { requireRRASession } from '@/lib/auth-guard';
import { SupplyChainMonitor } from '@/components/admin/supply-chain-monitor';

export default async function AdminSupplyChainPage() {
  await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supply Chain Monitor</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track product flow across manufacturing, wholesale, and retail tiers — with stale pending detection.
        </p>
      </div>

      <SupplyChainMonitor />
    </div>
  );
}
