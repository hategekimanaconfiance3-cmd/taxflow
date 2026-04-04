import { requireRRASession } from '@/lib/auth-guard';
import { getDashboardOverview } from '@/lib/actions/admin-dashboard.action';
import { getComplianceAlerts } from '@/lib/actions/admin-taxpayer-overview.action';
import { getAllTraders } from '@/lib/actions/admin.action';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { KpiCardSparkline } from '@/components/admin/overview/kpi-card-sparkline';
import { CommandCenterHero } from '@/components/admin/overview/command-center-hero';
import { TaxOpsCompact } from '@/components/admin/overview/tax-ops-compact';
import { StreamingTicker } from '@/components/admin/overview/streaming-ticker';
import { AdminOverviewActions } from '@/components/admin/overview/admin-overview-actions';
import { PriorityAlerts } from '@/components/admin/overview/priority-alerts';
import type { PriorityAlert } from '@/components/admin/overview/priority-alerts';
import { AdminRealtimeWrapper } from '@/components/admin/admin-realtime-wrapper';
import { AdminDashboardSearch } from '@/components/admin/admin-dashboard-search';
import { TimeFilter } from '@/components/admin/time-filter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCardSkeleton } from '@/components/admin/loading-skeletons';
import { Ship, Scale, Flag, Clock, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  Users,
  Receipt,
  Building,
  CreditCard,
  ArrowLeftRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Skeleton fallback for the data-dependent body section
// ---------------------------------------------------------------------------
function OverviewBodySkeleton() {
  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
      {/* Hero card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
      {/* Tax ops */}
      <div className="rounded-xl border bg-card p-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-5 w-8 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Ticker */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <Skeleton className="h-3 w-36" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async sub-component — fetches and renders the data-heavy body
// ---------------------------------------------------------------------------
async function OverviewBody({
  userId,
  from,
  to,
}: {
  userId: string;
  from: Date | undefined;
  to: Date | undefined;
}) {
  const [data, alerts, traders] = await Promise.all([
    getDashboardOverview(from, to),
    getComplianceAlerts(),
    getAllTraders(),
  ]);

  const completionRate =
    data.revenue.netVatDue > 0
      ? Math.min(Math.round((data.revenue.taxPaymentsTotal / data.revenue.netVatDue) * 100), 100)
      : data.revenue.taxPaymentsTotal > 0 ? 100 : 0;

  const priorityAlerts: PriorityAlert[] = [];

  if (data.traders.suspended > 0) {
    priorityAlerts.push({
      id: 'suspended-traders',
      severity: 'critical',
      message: `${data.traders.suspended} trader${data.traders.suspended !== 1 ? 's' : ''} suspended — review required`,
      href: '/admin/traders',
    });
  }

  if (data.traders.flagged > 0) {
    priorityAlerts.push({
      id: 'flagged-traders',
      severity: 'warning',
      message: `${data.traders.flagged} flagged trader${data.traders.flagged !== 1 ? 's' : ''} with suspicious activity`,
      href: '/admin/traders',
    });
  }

  if (alerts.pendingPayments.count > 0) {
    priorityAlerts.push({
      id: 'pending-payments',
      severity: 'warning',
      message: `${alerts.pendingPayments.count} uncleared payment${alerts.pendingPayments.count !== 1 ? 's' : ''} totalling ${formatRWF(alerts.pendingPayments.total)}`,
      href: '/admin/payments',
    });
  }

  if (data.disputes.filed > 0) {
    priorityAlerts.push({
      id: 'filed-disputes',
      severity: 'info',
      message: `${data.disputes.filed} new dispute${data.disputes.filed !== 1 ? 's' : ''} filed and awaiting assignment`,
      href: '/admin/disputes',
    });
  }

  const weeklyDailyAvg = data.transactions.thisWeek.count / 7;
  if (weeklyDailyAvg > 10 && data.transactions.today.count < weeklyDailyAvg * 0.2) {
    priorityAlerts.push({
      id: 'low-activity',
      severity: 'warning',
      message: 'Unusual drop in transaction activity today vs daily average',
      href: '/admin/transactions',
    });
  }

  const taxInsight = (() => {
    if (completionRate >= 95) return '✅ Payments on track — collection near target';
    if (completionRate >= 70) return '⚠️ Collection below target — outstanding balances detected';
    if (completionRate === 0 && data.revenue.netVatDue === 0) return 'No VAT due for selected period';
    return '🔴 Low collection rate — significant outstanding amounts';
  })();

  const txnInsight = (() => {
    if (data.transactions.today.count === 0) return '⚠️ No transactions recorded today';
    if (weeklyDailyAvg > 0 && data.transactions.today.count < weeklyDailyAvg * 0.5)
      return '⚠️ Transaction volume significantly below daily average';
    if (weeklyDailyAvg > 0 && data.transactions.today.count > weeklyDailyAvg * 1.5)
      return '✅ High activity day — above daily average';
    return `✅ ${data.transactions.today.count} transactions recorded today`;
  })();

  const tickerInsight = (() => {
    if (data.transactions.pending > 0)
      return `⚠️ ${data.transactions.pending} pending transaction${data.transactions.pending !== 1 ? 's' : ''} awaiting confirmation`;
    if (data.transactions.total === 0) return 'No transaction data for selected period';
    return '✅ All recent transactions cleared successfully';
  })();

  return (
    <>
      {/* ── PRIORITY ALERTS ────────────────────────────── */}
      <PriorityAlerts alerts={priorityAlerts} />

      {/* ── QUICK ACTIONS ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mr-1">
          Quick Actions
        </span>
        {data.traders.flagged > 0 && (
          <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50">
            <Link href="/admin/traders?filter=flagged">
              <Flag className="h-3 w-3" />
              {data.traders.flagged} flagged trader{data.traders.flagged !== 1 ? 's' : ''}
            </Link>
          </Button>
        )}
        {data.transactions.pending > 0 && (
          <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <Link href="/admin/transactions?status=pending">
              <Clock className="h-3 w-3" />
              {data.transactions.pending} pending transaction{data.transactions.pending !== 1 ? 's' : ''}
            </Link>
          </Button>
        )}
        {data.imports.submitted > 0 && (
          <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50">
            <Link href="/admin/imports">
              <Ship className="h-3 w-3" />
              {data.imports.submitted} import{data.imports.submitted !== 1 ? 's' : ''} pending approval
            </Link>
          </Button>
        )}
        {data.disputes.underReview > 0 && (
          <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50">
            <Link href="/admin/disputes">
              <Scale className="h-3 w-3" />
              {data.disputes.underReview} dispute{data.disputes.underReview !== 1 ? 's' : ''} to review
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground ml-auto">
          <Link href="/admin/dashboard/analytics">
            <BarChart3 className="h-3 w-3" />
            Open Analytics
          </Link>
        </Button>
        <AdminOverviewActions traders={traders} />
      </div>

      {/* ── KPI CARDS WITH SPARKLINES ───────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <KpiCardSparkline
          title="Registered Traders"
          value={data.traders.total}
          description={`${data.traders.byRole['manufacturer'] ?? 0} mfr · ${data.traders.byRole['wholesaler'] ?? 0} whl · ${data.traders.byRole['retailer'] ?? 0} ret`}
          icon={<Users className="h-4 w-4" />}
          sparkKey="transactions"
          sparkColor="#6366f1"
        />
        <KpiCardSparkline
          title="Total Taxes Generated"
          value={formatRWF(data.revenue.vatOutput)}
          description="System-wide output VAT"
          icon={<Receipt className="h-4 w-4" />}
          trend={data.trends.vatGenerated}
          sparkKey="vatGenerated"
          sparkColor="#10b981"
        />
        <KpiCardSparkline
          title="Total VAT Collected"
          value={formatRWF(data.revenue.taxPaymentsTotal)}
          description={`Net due: ${formatRWF(data.revenue.netVatDue)}`}
          icon={<Building className="h-4 w-4" />}
          trend={data.trends.vatCollected}
          sparkKey="vatCollected"
          sparkColor="#3b82f6"
        />
        <KpiCardSparkline
          title="Pending Payments"
          value={formatRWF(alerts.pendingPayments.total)}
          description={
            alerts.pendingPayments.count === 0
              ? 'No pending payments'
              : `${alerts.pendingPayments.count} pending`
          }
          icon={<CreditCard className="h-4 w-4" />}
          sparkKey="vatCollected"
          sparkColor="#f59e0b"
        />
        <KpiCardSparkline
          title="Total Transactions"
          value={data.transactions.total > 0 ? data.transactions.total.toLocaleString() : '—'}
          description={
            data.transactions.total === 0
              ? 'No data for selected period'
              : formatRWF(data.transactions.totalValue)
          }
          icon={<ArrowLeftRight className="h-4 w-4" />}
          trend={data.trends.transactions}
          sparkKey="transactions"
          sparkColor="#10b981"
        />
      </div>

      {/* ── HERO: Live Transaction Flow + Velocity Gauge ──── */}
      <CommandCenterHero
        userId={userId}
        todayCount={data.transactions.today.count}
        todayValue={data.transactions.today.value}
        weekCount={data.transactions.thisWeek.count}
        weekValue={data.transactions.thisWeek.value}
        insight={txnInsight}
      />

      {/* ── TAX COLLECTION + OPERATIONS (compact) ─── */}
      <TaxOpsCompact
        tax={{
          completionRate,
          collected: data.revenue.taxPaymentsTotal,
          outstanding: data.revenue.outstanding,
          paymentsCount: data.revenue.taxPaymentsCount,
        }}
        ops={{
          pendingTxns: data.transactions.pending,
          importsToReview: data.imports.submitted,
          disputesToReview: data.disputes.underReview,
          cleared: data.traders.byClearance['cleared'] ?? 0,
          flagged: data.traders.flagged,
          suspended: data.traders.suspended,
        }}
        insight={taxInsight}
      />

      {/* ── LIVE TRANSACTION FEED ──────────────────── */}
      <StreamingTicker userId={userId} insight={tickerInsight} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page shell — renders the header immediately, streams the body
// ---------------------------------------------------------------------------
export default async function AdminDashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, staff } = await requireRRASession();
  const params = await searchParams;

  const from = params.from ? new Date(params.from + 'T00:00:00') : undefined;
  const to = params.to ? new Date(params.to + 'T23:59:59') : undefined;

  return (
    <AdminRealtimeWrapper userId={user.id}>
      <div className="space-y-4">

        {/* ── HEADER — renders immediately ──────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight">RRA Command Center</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {staff.department ?? 'General'} ·{' '}
              <span className="font-mono">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Suspense fallback={null}>
              <TimeFilter />
            </Suspense>
            <AdminDashboardSearch />
          </div>
        </div>

        {/* ── BODY — streams while DB queries run ───────────── */}
        <Suspense fallback={<OverviewBodySkeleton />}>
          <OverviewBody userId={user.id} from={from} to={to} />
        </Suspense>

      </div>
    </AdminRealtimeWrapper>
  );
}
