import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { auditLog } from '@/db/schema';
import { sql, desc, gte, and, like } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, AlertTriangle, CheckCircle2, Clock, SlidersHorizontal } from 'lucide-react';

const PAGE_SIZE = 30;

interface AuditExplorerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditExplorerPage({ searchParams }: AuditExplorerPageProps) {
  await requireRRASession('super_admin');

  const params = await searchParams;
  const page = Math.max(1, parseInt(String(params.page ?? '1'), 10));
  const actionFilter = String(params.action ?? '');
  const targetTypeFilter = String(params.target ?? '');

  const offset = (page - 1) * PAGE_SIZE;

  // Build where conditions
  const conditions = [];
  if (actionFilter) conditions.push(like(auditLog.action, `%${actionFilter}%`));
  if (targetTypeFilter && auditLog.targetType) {
    conditions.push(like(auditLog.targetType, `%${targetTypeFilter}%`));
  }

  const whereClause = conditions.length > 0 ? and(...(conditions as [typeof conditions[0], ...typeof conditions])) : undefined;

  const [events, countRow, actionStats, last24hRow] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db
      .select({ count: sql<number>`COUNT(*)::int`.as('count') })
      .from(auditLog)
      .where(whereClause)
      .then(([r]) => r?.count ?? 0),

    // Top action types — last 7 days
    db
      .select({
        action: auditLog.action,
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(auditLog)
      .where(gte(auditLog.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
      .groupBy(auditLog.action)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(8),

    // Last 24h
    db
      .select({ count: sql<number>`COUNT(*)::int`.as('count') })
      .from(auditLog)
      .where(gte(auditLog.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .then(([r]) => r?.count ?? 0),
  ]);

  const totalEvents = countRow;
  const last24hCount = last24hRow;
  const totalPages = Math.ceil(totalEvents / PAGE_SIZE);

  function eventSeverity(action: string) {
    if (action.includes('DENIED') || action.includes('SUSPICIOUS')) return 'critical';
    if (action.includes('ROLE_CHANGED') || action.includes('DELETED')) return 'high';
    if (action.includes('UPDATED') || action.includes('KPI_TARGET') || action.includes('CONFIG')) return 'medium';
    return 'info';
  }

  function severityBadgeClass(sev: string) {
    if (sev === 'critical') return 'border-red-200 text-red-700 bg-red-50/60';
    if (sev === 'high') return 'border-orange-200 text-orange-700 bg-orange-50/60';
    if (sev === 'medium') return 'border-amber-200 text-amber-700 bg-amber-50/60';
    return 'border-blue-200 text-blue-700 bg-blue-50/60';
  }

  function buildHref(p: number) {
    const qs = new URLSearchParams();
    if (p > 1) qs.set('page', String(p));
    if (actionFilter) qs.set('action', actionFilter);
    if (targetTypeFilter) qs.set('target', targetTypeFilter);
    const s = qs.toString();
    return `/admin/super/audit${s ? `?${s}` : ''}`;
  }

  const quickFilters = [
    { label: 'All events', href: '/admin/super/audit' },
    { label: 'Access Denied', href: '/admin/super/audit?action=DENIED' },
    { label: 'Role Changes', href: '/admin/super/audit?action=ROLE_CHANGED' },
    { label: 'Suspicious Flags', href: '/admin/super/audit?action=SUSPICIOUS' },
    { label: 'Config Changes', href: '/admin/super/audit?action=CONFIG' },
    { label: 'KPI Targets', href: '/admin/super/audit?action=KPI_TARGET' },
    { label: 'Target: user', href: '/admin/super/audit?target=user' },
    { label: 'Target: transaction', href: '/admin/super/audit?target=transaction' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Eye className="h-6 w-6 text-rose-500" />
          Audit Explorer
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Full platform audit log — all user and system actions · Super Admin only
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Matching Events
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{totalEvents.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(actionFilter || targetTypeFilter) ? 'filtered results' : 'all audit events'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-500" /> Last 24h
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{last24hCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-0.5">audit events in last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-violet-500" /> Active Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">
              {(actionFilter ? 1 : 0) + (targetTypeFilter ? 1 : 0)}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {actionFilter && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  action: {actionFilter}
                </Badge>
              )}
              {targetTypeFilter && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  target: {targetTypeFilter}
                </Badge>
              )}
              {!actionFilter && !targetTypeFilter && (
                <span className="text-[10px] text-muted-foreground">none — showing all</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top action types */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Actions (7 days)</CardTitle>
            <CardDescription className="text-xs">Most frequent event types</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events in last 7 days</p>
            ) : (
              actionStats.map((a) => (
                <div key={a.action} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
                    {a.action}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                    {a.count}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quick filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Quick Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {quickFilters.map((f) => (
              <a
                key={f.href}
                href={f.href}
                className="block text-xs text-primary hover:underline py-0.5"
              >
                {f.label}
              </a>
            ))}
          </CardContent>
        </Card>

        {/* Pagination info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Navigation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong>
              {' · '}{totalEvents.toLocaleString()} total events
            </p>
            <div className="flex gap-4">
              {page > 1 && (
                <a href={buildHref(page - 1)} className="text-xs text-primary hover:underline">
                  ← Previous page
                </a>
              )}
              {page < totalPages && (
                <a href={buildHref(page + 1)} className="text-xs text-primary hover:underline">
                  Next page →
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main audit log table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" /> Audit Log
          </CardTitle>
          <CardDescription>
            {actionFilter && `Action filter: "${actionFilter}" · `}
            {targetTypeFilter && `Target filter: "${targetTypeFilter}" · `}
            Showing {events.length} of {totalEvents.toLocaleString()} events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No audit events match the current filter
              </p>
              <a href="/admin/super/audit" className="text-xs text-primary hover:underline">
                Clear filters
              </a>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs">Action</th>
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs w-20">Severity</th>
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Actor</th>
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Target</th>
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">IP</th>
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground text-xs">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const sev = eventSeverity(ev.action);
                      const isCritical = sev === 'critical';
                      return (
                        <tr
                          key={ev.id}
                          className={`border-b last:border-0 transition-colors ${
                            isCritical
                              ? 'bg-red-50/30 hover:bg-red-50/50'
                              : 'hover:bg-muted/20'
                          }`}
                        >
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1.5">
                              {isCritical && (
                                <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                              )}
                              <span
                                className={`font-mono text-[11px] ${
                                  isCritical ? 'text-red-700 font-semibold' : ''
                                }`}
                              >
                                {ev.action}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] h-5 px-1.5 ${severityBadgeClass(sev)}`}
                            >
                              {sev}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-2 hidden md:table-cell">
                            <span className="text-xs text-muted-foreground font-mono">
                              {ev.userId ? ev.userId.slice(0, 8) + '…' : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 hidden md:table-cell">
                            <span className="text-xs text-muted-foreground">
                              {ev.targetType ?? '—'}
                              {ev.targetId && (
                                <span className="font-mono ml-1 text-[10px]">
                                  {ev.targetId.slice(0, 6)}…
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 hidden lg:table-cell">
                            <span className="text-xs text-muted-foreground font-mono">
                              {ev.ipAddress ?? '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {ev.createdAt
                                ? new Date(ev.createdAt).toLocaleString()
                                : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-4">
                    {page > 1 && (
                      <a href={buildHref(page - 1)} className="text-xs text-primary hover:underline">
                        ← Previous
                      </a>
                    )}
                    {page < totalPages && (
                      <a href={buildHref(page + 1)} className="text-xs text-primary hover:underline">
                        Next →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
