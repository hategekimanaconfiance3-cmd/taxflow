import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { user, vatRecord, taxPayment, auditLog, rraStaff } from '@/db/schema';
import { sql, desc, gte } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert, Users, ArrowLeftRight, CreditCard, AlertTriangle,
  TrendingUp, UserCog, Lock, Server, Eye, Activity, Building2,
  Scale, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { SuperAdminSearch } from '@/components/admin/super/super-admin-search';

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B RWF`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M RWF`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K RWF`;
  return `${n.toLocaleString()} RWF`;
}

export default async function SuperAdminOverviewPage() {
  await requireRRASession('super_admin');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    traderStats,
    vatStats,
    paymentStats,
    staffStats,
    recentAuditCount,
    securityEvents,
    recentActions,
  ] = await Promise.all([
    // Trader breakdown by role
    db
      .select({
        role: user.role,
        count: sql<number>`COUNT(*)::int`.as('count'),
        active: sql<number>`COUNT(*) FILTER (WHERE ${user.clearanceStatus} = 'approved')::int`.as('active'),
        suspended: sql<number>`COUNT(*) FILTER (WHERE ${user.clearanceStatus} = 'suspended')::int`.as('suspended'),
        underReview: sql<number>`COUNT(*) FILTER (WHERE ${user.clearanceStatus} = 'under_review')::int`.as('underReview'),
      })
      .from(user)
      .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)
      .groupBy(user.role),

    // Platform VAT totals
    db
      .select({
        vatType: vatRecord.vatType,
        total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(vatRecord)
      .where(sql`${vatRecord.isFrozen} = false`)
      .groupBy(vatRecord.vatType),

    // Payment stats
    db
      .select({
        confirmed: sql<number>`COALESCE(SUM(${taxPayment.amount}) FILTER (WHERE ${taxPayment.status} = 'confirmed'), 0)::float8`.as('confirmed'),
        pending: sql<number>`COALESCE(SUM(${taxPayment.amount}) FILTER (WHERE ${taxPayment.status} = 'pending'), 0)::float8`.as('pending'),
        confirmedCount: sql<number>`COUNT(*) FILTER (WHERE ${taxPayment.status} = 'confirmed')::int`.as('confirmedCount'),
        pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${taxPayment.status} = 'pending')::int`.as('pendingCount'),
        last30d: sql<number>`COALESCE(SUM(${taxPayment.amount}) FILTER (WHERE ${taxPayment.status} = 'confirmed' AND ${taxPayment.createdAt} >= ${thirtyDaysAgo}), 0)::float8`.as('last30d'),
      })
      .from(taxPayment)
      .then(([r]) => r ?? { confirmed: 0, pending: 0, confirmedCount: 0, pendingCount: 0, last30d: 0 }),

    // Staff summary
    db
      .select({
        total: sql<number>`COUNT(*)::int`.as('total'),
        active: sql<number>`COUNT(*) FILTER (WHERE ${rraStaff.isActive} = true)::int`.as('active'),
      })
      .from(rraStaff)
      .then(([r]) => r ?? { total: 0, active: 0 }),

    // Audit events last 7 days
    db
      .select({ count: sql<number>`COUNT(*)::int`.as('count') })
      .from(auditLog)
      .where(gte(auditLog.createdAt, sevenDaysAgo))
      .then(([r]) => r?.count ?? 0),

    // Security event count
    db
      .select({ count: sql<number>`COUNT(*)::int`.as('count') })
      .from(auditLog)
      .where(
        sql`${auditLog.action} IN ('ACCESS_DENIED_INSUFFICIENT_ROLE', 'ACCESS_DENIED_UNKNOWN_ROLE', 'SUSPICIOUS_FLAGGED', 'STAFF_ROLE_CHANGED') AND ${auditLog.createdAt} >= ${sevenDaysAgo}`
      )
      .then(([r]) => r?.count ?? 0),

    // Recent audit actions
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        targetType: auditLog.targetType,
        createdAt: auditLog.createdAt,
        ipAddress: auditLog.ipAddress,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(8),
  ]);

  // Aggregate trader stats
  const traderTotal = traderStats.reduce((sum, r) => sum + r.count, 0);
  const traderActive = traderStats.reduce((sum, r) => sum + r.active, 0);
  const traderSuspended = traderStats.reduce((sum, r) => sum + r.suspended, 0);
  const traderUnderReview = traderStats.reduce((sum, r) => sum + r.underReview, 0);

  // VAT totals
  const vatOutput = vatStats.find((r) => r.vatType === 'output')?.total ?? 0;
  const vatInput = vatStats.find((r) => r.vatType === 'input')?.total ?? 0;
  const netVatDue = Math.max(0, vatOutput - vatInput);
  const vatPaymentCoverage = netVatDue > 0
    ? Math.min(100, Math.round((paymentStats.confirmed / netVatDue) * 100))
    : 100;

  const controlPlaneLinks = [
    { label: 'Manufacturing Standards', href: '/admin/super/manufacturing/tolerances', icon: Scale, desc: 'Official tolerance versions and approvals' },
    { label: 'Admin Management', href: '/admin/super/admins', icon: UserCog, desc: 'Staff roles & access' },
    { label: 'Security Center', href: '/admin/super/security', icon: Lock, desc: 'Auth & permission audit' },
    { label: 'System Health', href: '/admin/super/system', icon: Server, desc: 'DB & app status' },
    { label: 'Top Taxpayers', href: '/admin/super/taxpayers', icon: TrendingUp, desc: 'VAT ranking by business' },
    { label: 'Audit Explorer', href: '/admin/super/audit', icon: Eye, desc: 'Deep audit log search' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-rose-500" />
            Super Admin Command Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Platform-wide intelligence and control — Super Admin exclusive workspace
          </p>
        </div>
        <Badge variant="outline" className="border-rose-200 text-rose-700 bg-rose-50/60 text-xs">
          SUPER ADMIN
        </Badge>
      </div>

      {/* Prominent Search Bar */}
      <div className="w-full max-w-2xl">
        <SuperAdminSearch size="lg" />
      </div>

      {/* Platform KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Registered Traders
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{traderTotal.toLocaleString()}</div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-200 text-emerald-700 bg-emerald-50/40">
                {traderActive} active
              </Badge>
              {traderUnderReview > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-200 text-amber-700 bg-amber-50/40">
                  {traderUnderReview} review
                </Badge>
              )}
              {traderSuspended > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-red-200 text-red-700 bg-red-50/40">
                  {traderSuspended} suspended
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-violet-500" /> Net VAT Due
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{fmt(netVatDue)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Output {fmt(vatOutput)} − Input {fmt(vatInput)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-emerald-500" /> Confirmed Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">{fmt(paymentStats.confirmed)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {paymentStats.confirmedCount} payments · {vatPaymentCoverage}% VAT coverage
              {paymentStats.pendingCount > 0 && ` · ${paymentStats.pendingCount} pending`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-500" /> Security Events
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={`text-2xl font-bold ${securityEvents > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {securityEvents}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {recentAuditCount.toLocaleString()} audit events · 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trader Type Breakdown + Control Plane Links */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trader breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Trader Breakdown
            </CardTitle>
            <CardDescription>Active taxpayers by business type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {traderStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No traders registered</p>
              ) : (
                traderStats
                  .sort((a, b) => b.count - a.count)
                  .map((r) => {
                    const pct = traderTotal > 0 ? Math.round((r.count / traderTotal) * 100) : 0;
                    const roleLabel = r.role === 'manufacturer' ? 'Manufacturer' : r.role === 'wholesaler' ? 'Wholesaler' : 'Retailer';
                    const roleColor = r.role === 'manufacturer' ? 'bg-blue-500' : r.role === 'wholesaler' ? 'bg-violet-500' : 'bg-emerald-500';
                    return (
                      <div key={r.role} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{roleLabel}</span>
                          <span className="text-muted-foreground text-xs">
                            {r.count} total · {r.active} active
                            {r.suspended > 0 && <span className="text-red-500 ml-1">· {r.suspended} suspended</span>}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${roleColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Control Plane Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" /> Control Plane
            </CardTitle>
            <CardDescription>Super Admin exclusive management areas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2">
              {controlPlaneLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/40 transition-colors group"
                >
                  <div className="h-8 w-8 rounded-md bg-rose-50 flex items-center justify-center shrink-0 group-hover:bg-rose-100 transition-colors">
                    <link.icon className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.desc}</p>
                  </div>
                  <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Summary + Recent Audit Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Staff */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCog className="h-4 w-4" /> Staff Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total staff accounts</span>
              <span className="font-semibold">{staffStats.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active accounts</span>
              <span className="font-semibold text-emerald-600">{staffStats.active}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Inactive / suspended</span>
              <span className={`font-semibold ${staffStats.total - staffStats.active > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {staffStats.total - staffStats.active}
              </span>
            </div>
            <div className="pt-2 border-t">
              <Link href="/admin/super/admins" className="text-xs text-primary hover:underline">
                View all staff →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent audit events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Recent Audit Activity
            </CardTitle>
            <CardDescription>Latest platform events — all users</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActions.length === 0 ? (
              <div className="py-6 text-center space-y-1">
                <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto" />
                <p className="text-sm text-muted-foreground">No audit events found</p>
              </div>
            ) : (
              <div className="divide-y">
                {recentActions.map((ev) => {
                  const isSecurity = ev.action.includes('DENIED') || ev.action.includes('SUSPICIOUS');
                  return (
                    <div key={ev.id} className="py-2 flex items-start gap-2">
                      <AlertTriangle
                        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isSecurity ? 'text-red-500' : 'text-muted-foreground'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-mono truncate ${isSecurity ? 'text-red-700 font-semibold' : ''}`}>
                          {ev.action}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {ev.targetType ?? 'system'} · {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—'}
                          {ev.ipAddress && <span className="ml-1 font-mono">{ev.ipAddress}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="pt-3 border-t mt-2">
              <Link href="/admin/super/audit" className="text-xs text-primary hover:underline">
                Open Audit Explorer →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
