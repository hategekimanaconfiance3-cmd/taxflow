import { requireRRASession } from '@/lib/auth-guard';
import { SectorAnalysis } from '@/components/admin/analytics/sector-analysis';
import { VatPerformance } from '@/components/admin/analytics/vat-performance';
import { TransactionAnalytics } from '@/components/admin/analytics/transaction-analytics';
import { SupplyChainSummary } from '@/components/admin/analytics/supply-chain-summary';
import { EconomicSummary } from '@/components/admin/analytics/economic-summary';

export default async function AdminAnalyticsPage() {
  await requireRRASession("super_admin", "reporting_officer", "director_executive", "data_ai_analyst");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          System-wide transaction, VAT, and sector performance insights.
        </p>
      </div>

      <div className="grid gap-6">
        <VatPerformance />
        <SectorAnalysis />
        <div className="grid gap-6 lg:grid-cols-2">
          <TransactionAnalytics />
          <SupplyChainSummary />
        </div>
        <EconomicSummary />
      </div>
    </div>
  );
}
