import { requireRRASession } from '@/lib/auth-guard';
import { getFindingStats, getFindings } from '@/lib/actions/ai-finding.action';
import { computeAllRiskScores } from '@/lib/ai/risk-scoring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/stat-card/stat-card';
import {
  Brain,
  AlertCircle,
  Clock,
  Users,
  Database,
  CalendarDays,
  AlertTriangle,
  ChevronRight,
  Activity,
  ScrollText,
  UserSearch,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import Link from 'next/link';
import { IntelligenceActionButtons } from '@/components/admin/intelligence-action-buttons';
import { hasRRAPermission } from '@/lib/rra-rbac';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityBadge(severity: string) {
  const cfg: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high:     'bg-orange-100 text-orange-700 border-orange-200',
    medium:   'bg-amber-100 text-amber-700 border-amber-200',
    low:      'bg-blue-100 text-blue-700 border-blue-200',
    warning:  'bg-amber-100 text-amber-700 border-amber-200',
    info:     'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <Badge variant="outline" className={cfg[severity] ?? ''}>
      {severity}
    </Badge>
  );
}

function statusBadge(status: string) {
  const cfg: Record<string, string> = {
    open:         'bg-red-50 text-red-600 border-red-200',
    under_review: 'bg-amber-50 text-amber-700 border-amber-200',
    resolved:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    dismissed:    'bg-slate-50 text-slate-500 border-slate-200',
  };
  return (
    <Badge variant="outline" className={cfg[status] ?? ''}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

const TYPE_LABELS: Record<string, string> = {
  inventory_discrepancy: 'Inventory Discrepancy',
  stock_discrepancy:     'Stock Discrepancy',
  underreporting:        'Underreporting',
  price_anomaly:         'Price Anomaly',
  tax_gap:               'Tax Gap',
  duplicate_transaction: 'Duplicate Txn',
  supply_chain_gap:      'Supply Chain Gap',
  data_quality:          'Data Quality',
  risk_score:            'Risk Score',
  production_discrepancy: 'Production History Signal',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface SearchParams { tab?: string }

export default async function IntelligenceHubPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { staff } = await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer", "data_ai_analyst");
  const params = await searchParams;
  const activeTab = params.tab ?? 'all';

  // ── Data fetching ─────────────────────────────────────────────────────────
  let stats = {
    total: 0, open: 0, critical: 0, underReview: 0,
    highRiskBusinesses: 0, dataQualityIssues: 0, lastScanAt: null as Date | null,
  };
  try {
    stats = await getFindingStats();
  } catch { /* noop */ }

  // Recent findings (last 20) with optional tab filter
  const statusFilter = activeTab === 'open'         ? 'open'
                     : activeTab === 'critical'     ? undefined
                     : activeTab === 'under_review' ? 'under_review'
                     : undefined;
  const severityFilter = activeTab === 'critical' ? 'critical' : undefined;

  let findings: Awaited<ReturnType<typeof getFindings>> = [];
  try {
    findings = await getFindings({
      reviewStatus: statusFilter as 'open' | 'under_review' | 'resolved' | 'dismissed' | undefined,
      severity:     severityFilter as 'critical' | undefined,
      limit: 20,
    });
  } catch { /* noop */ }

  // Risk score band counts
  const riskBands = { low: 0, medium: 0, high: 0, critical: 0 };
  try {
    const scores = await computeAllRiskScores();
    for (const s of scores) {
      riskBands[s.level]++;
    }
  } catch { /* noop */ }

  const TABS = [
    { key: 'all',          label: 'All' },
    { key: 'open',         label: 'Open' },
    { key: 'critical',     label: 'Critical' },
    { key: 'under_review', label: 'Under Review' },
  ];

  return (
    <div className="space-y-8">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-violet-500" />
            Intelligence Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered compliance intelligence: findings, risk scores, reconciliation &amp; anomaly detection.
          </p>
        </div>
        <Link href="/admin/intelligence/findings">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Layers className="h-3.5 w-3.5" />
            All Findings
          </Button>
        </Link>
      </div>

      {/* ── Section A: Stat Cards ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Intelligence Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Total Open Findings"
            value={stats.open}
            description="Requires review"
            icon={<AlertCircle className="h-4 w-4" />}
            className="border-l-4 border-l-red-400"
          />
          <StatCard
            title="Critical Findings"
            value={stats.critical}
            description="Immediate action needed"
            icon={<ShieldAlert className="h-4 w-4" />}
            className="border-l-4 border-l-red-600"
          />
          <StatCard
            title="Under Review"
            value={stats.underReview}
            description="Being investigated"
            icon={<Clock className="h-4 w-4" />}
            className="border-l-4 border-l-amber-400"
          />
          <StatCard
            title="High/Critical Risk"
            value={riskBands.high + riskBands.critical}
            description="Businesses with elevated risk"
            icon={<Users className="h-4 w-4" />}
            className="border-l-4 border-l-orange-400"
          />
          <StatCard
            title="Data Quality Issues"
            value={stats.dataQualityIssues}
            description="Flagged data gaps"
            icon={<Database className="h-4 w-4" />}
            className="border-l-4 border-l-blue-400"
          />
          <StatCard
            title="Last Scan"
            value={stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleDateString() : 'Never'}
            description="Most recent reconciliation run"
            icon={<CalendarDays className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* ── Section B: Recent Findings Table ───────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Findings
          </h2>
          <Link
            href="/admin/intelligence/findings"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Inventory discrepancies are screening signals for officer review. The current scan compares declared movement over 30 days with recorded current stock; it is not a tax assessment.
        </p>

        {/* Tab filter */}
        <div className="flex items-center gap-1 border-b mb-4">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/admin/intelligence?tab=${tab.key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead className="text-right">Observed</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Brain className="h-8 w-8 text-muted-foreground/30" />
                        <p>No findings yet. Run a reconciliation scan to generate intelligence.</p>
                        <p className="text-xs">Use the Quick Actions below to start a scan.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {findings.map((f) => (
                  <TableRow key={f.id} className="text-xs">
                    <TableCell className="font-medium">
                      {TYPE_LABELS[f.findingType] ?? f.findingType}
                    </TableCell>
                    <TableCell>{severityBadge(f.severity)}</TableCell>
                    <TableCell>
                      {f.businessId ? (
                        <Link
                          href={`/admin/intelligence/business/${f.businessId}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {f.businessName ?? f.businessId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {f.observedValue != null ? f.observedValue.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {f.expectedValue != null ? f.expectedValue.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${
                      (f.difference ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {f.difference != null ? f.difference.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(f.reviewStatus)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* ── Section C: Quick Actions ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Server action buttons live in a client component */}
          <IntelligenceActionButtons
            canRunReconciliation={['stock_officer', 'compliance_officer', 'audit_officer', 'product_traceability_officer', 'tax_compliance_officer', 'audit_investigation_officer'].includes(staff.clearanceLevel)}
            canRunDataQuality={['compliance_officer', 'audit_officer', 'tax_compliance_officer', 'audit_investigation_officer', 'data_ai_analyst'].includes(staff.clearanceLevel)}
            canRunProductionHistory={staff.clearanceRoles.some((role) => role !== 'super_admin' && hasRRAPermission(role, 'production.formula.read'))}
          />

          {/* Pure link cards */}
          <Link href="/admin/anomalies">
            <Card className="h-full hover:border-foreground/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                  <Activity className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Detect Anomalies</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Run AI anomaly detection on recent transactions.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/audit">
            <Card className="h-full hover:border-foreground/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                  <ScrollText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Audit Recommendations</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    View AI-generated audit priority queue.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/intelligence/unregistered">
            <Card className="h-full hover:border-foreground/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                  <UserSearch className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Unregistered Taxpayers</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Discover potential taxpayers from supply chain.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* ── Section D: Risk Score Heatmap Summary ───────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Risk Score Distribution
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {(
            [
              { level: 'low',      label: 'Low Risk',      color: 'border-l-emerald-400' },
              { level: 'medium',   label: 'Medium Risk',   color: 'border-l-amber-400' },
              { level: 'high',     label: 'High Risk',     color: 'border-l-orange-400' },
              { level: 'critical', label: 'Critical Risk', color: 'border-l-red-500' },
            ] as const
          ).map(({ level, label, color }) => (
            <Card key={level} className={`border-l-4 ${color}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-3xl font-bold tabular-nums">
                  {riskBands[level]}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">businesses</p>
                <div className="mt-3">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        level === 'low'      ? 'bg-emerald-400' :
                        level === 'medium'   ? 'bg-amber-400'   :
                        level === 'high'     ? 'bg-orange-400'  :
                                              'bg-red-500'
                      }`}
                      style={{
                        width: `${
                          (riskBands.low + riskBands.medium + riskBands.high + riskBands.critical) > 0
                            ? Math.round(
                                (riskBands[level] /
                                  (riskBands.low + riskBands.medium + riskBands.high + riskBands.critical)) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {riskBands.low + riskBands.medium + riskBands.high + riskBands.critical === 0 && (
          <Card className="mt-3">
            <CardContent className="py-8 flex flex-col items-center gap-2 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">No risk scores computed yet</p>
              <p className="text-xs text-muted-foreground">
                Run a reconciliation scan or wait for the AI compute job to run.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
