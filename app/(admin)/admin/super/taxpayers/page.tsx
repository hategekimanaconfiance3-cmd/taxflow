import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { vatRecord, taxPayment, user } from '@/db/schema';
import { sql, desc, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Crown, Building2, AlertTriangle } from 'lucide-react';

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B RWF`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M RWF`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K RWF`;
  return `${n.toLocaleString()} RWF`;
}

const RANK_COLORS = [
  'text-amber-500',   // #1
  'text-slate-400',   // #2
  'text-amber-700',   // #3
  'text-muted-foreground', // #4+
];

export default async function TopTaxpayersPage() {
  await requireRRASession('super_admin');

  // Step 1: Top taxpayers by output VAT output aggregate
  const topByVatOutput = await db
    .select({
      businessId: vatRecord.businessId,
      vatOutput: sql<number>`COALESCE(SUM(${vatRecord.amount}) FILTER (WHERE ${vatRecord.vatType} = 'output'), 0)::float8`.as('vatOutput'),
      vatInput: sql<number>`COALESCE(SUM(${vatRecord.amount}) FILTER (WHERE ${vatRecord.vatType} = 'input'), 0)::float8`.as('vatInput'),
      recordCount: sql<number>`COUNT(*)::int`.as('recordCount'),
    })
    .from(vatRecord)
    .where(sql`${vatRecord.isFrozen} = false`)
    .groupBy(vatRecord.businessId)
    .orderBy(
      desc(sql`COALESCE(SUM(${vatRecord.amount}) FILTER (WHERE ${vatRecord.vatType} = 'output'), 0)`)
    )
    .limit(20);

  const businessIds = topByVatOutput.map((r) => r.businessId);

  if (businessIds.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-rose-500" />
            Top Taxpayer Rankings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">No VAT records found in the system.</p>
        </div>
      </div>
    );
  }

  // Step 2: Fetch business metadata and payment totals in parallel
  const [businesses, payments] = await Promise.all([
    db
      .select({
        id: user.id,
        businessName: user.businessName,
        role: user.role,
        tinNumber: user.tinNumber,
        clearanceStatus: user.clearanceStatus,
      })
      .from(user)
      .where(inArray(user.id, businessIds)),

    db
      .select({
        businessId: taxPayment.businessId,
        totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('totalPaid'),
      })
      .from(taxPayment)
      .where(
        sql`${taxPayment.status} = 'confirmed' AND ${taxPayment.businessId} IN (${sql.join(
          businessIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
      .groupBy(taxPayment.businessId),
  ]);

  const bizMap = new Map(businesses.map((b) => [b.id, b]));
  const payMap = new Map(payments.map((p) => [p.businessId, p.totalPaid]));

  const rows = topByVatOutput.map((r, i) => {
    const biz = bizMap.get(r.businessId);
    const paid = payMap.get(r.businessId) ?? 0;
    const netVatDue = Math.max(0, r.vatOutput - r.vatInput);
    const outstanding = Math.max(0, netVatDue - paid);
    const compliancePct =
      netVatDue > 0 ? Math.min(100, Math.round((paid / netVatDue) * 100)) : 100;

    return {
      rank: i + 1,
      businessId: r.businessId,
      businessName: biz?.businessName ?? '—',
      role: biz?.role ?? '—',
      tinNumber: biz?.tinNumber ?? '—',
      clearanceStatus: biz?.clearanceStatus ?? 'pending',
      vatOutput: r.vatOutput,
      vatInput: r.vatInput,
      netVatDue,
      paid,
      outstanding,
      compliancePct,
      recordCount: r.recordCount,
    };
  });

  // Summary stats
  const totalVatOutput = rows.reduce((s, r) => s + r.vatOutput, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const nonCompliant = rows.filter((r) => r.compliancePct < 100).length;

  function roleLabel(role: string) {
    if (role === 'manufacturer') return 'Manufacturer';
    if (role === 'wholesaler') return 'Wholesaler';
    if (role === 'retailer') return 'Retailer';
    return role;
  }

  function roleColor(role: string) {
    if (role === 'manufacturer') return 'border-blue-200 text-blue-700 bg-blue-50/40';
    if (role === 'wholesaler') return 'border-violet-200 text-violet-700 bg-violet-50/40';
    return 'border-emerald-200 text-emerald-700 bg-emerald-50/40';
  }

  function statusClass(status: string) {
    if (status === 'approved') return 'border-emerald-200 text-emerald-700 bg-emerald-50/40';
    if (status === 'suspended') return 'border-red-200 text-red-700 bg-red-50/40';
    if (status === 'under_review') return 'border-amber-200 text-amber-700 bg-amber-50/40';
    return 'border-muted text-muted-foreground';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-rose-500" />
          Top Taxpayer Rankings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ranked by total output VAT recorded — platform-wide intelligence view · Super Admin only
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5 text-amber-500" /> Top-20 VAT Output
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{fmt(totalVatOutput)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">combined across top 20 taxpayers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Outstanding (Top-20)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div
              className={`text-2xl font-bold ${
                totalOutstanding > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {fmt(totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">net unpaid VAT obligations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-rose-500" /> Non-Compliant
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div
              className={`text-2xl font-bold ${
                nonCompliant > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {nonCompliant}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">of top-20 with outstanding VAT</p>
          </CardContent>
        </Card>
      </div>

      {/* Rankings Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 20 Taxpayers by Output VAT</CardTitle>
          <CardDescription>
            Businesses contributing the most recorded output VAT to TaxFlow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs w-8">#</th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs">Business</th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Type</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground text-xs">Output VAT</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">Net Due</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">Paid</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground text-xs">Outstanding</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground text-xs">Coverage</th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs hidden xl:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.businessId}
                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${
                      r.outstanding > 0 && r.rank <= 5 ? 'bg-amber-50/20' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 px-2">
                      {r.rank <= 3 ? (
                        <Crown
                          className={`h-4 w-4 ${RANK_COLORS[r.rank - 1]}`}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                          {r.rank}
                        </span>
                      )}
                    </td>

                    {/* Business name + TIN */}
                    <td className="py-3 px-2">
                      <p className="font-medium truncate max-w-[180px]">{r.businessName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{r.tinNumber}</p>
                    </td>

                    {/* Type badge */}
                    <td className="py-3 px-2 hidden md:table-cell">
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-5 px-1.5 ${roleColor(r.role)}`}
                      >
                        {roleLabel(r.role)}
                      </Badge>
                    </td>

                    {/* Output VAT */}
                    <td className="py-3 px-2 text-right font-mono text-sm font-semibold">
                      {fmt(r.vatOutput)}
                    </td>

                    {/* Net Due */}
                    <td className="py-3 px-2 text-right text-xs text-muted-foreground font-mono hidden lg:table-cell">
                      {fmt(r.netVatDue)}
                    </td>

                    {/* Paid */}
                    <td className="py-3 px-2 text-right text-xs text-emerald-600 font-mono hidden lg:table-cell">
                      {r.paid > 0 ? fmt(r.paid) : '—'}
                    </td>

                    {/* Outstanding */}
                    <td className="py-3 px-2 text-right">
                      <span
                        className={`font-mono text-xs font-semibold ${
                          r.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {r.outstanding > 0 ? fmt(r.outstanding) : '✓'}
                      </span>
                    </td>

                    {/* Coverage bar + pct */}
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full transition-all ${
                              r.compliancePct >= 100
                                ? 'bg-emerald-500'
                                : r.compliancePct >= 50
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${r.compliancePct}%` }}
                          />
                        </div>
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            r.compliancePct >= 100
                              ? 'text-emerald-600'
                              : r.compliancePct >= 50
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {r.compliancePct}%
                        </span>
                      </div>
                    </td>

                    {/* Clearance status */}
                    <td className="py-3 px-2 hidden xl:table-cell">
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-5 px-1.5 ${statusClass(r.clearanceStatus ?? '')}`}
                      >
                        {r.clearanceStatus ?? 'unknown'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
