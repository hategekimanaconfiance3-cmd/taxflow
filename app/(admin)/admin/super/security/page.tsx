import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { auditLog } from '@/db/schema';
import { desc, sql, gte } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Lock, AlertTriangle, Activity, Key, CheckCircle2 } from 'lucide-react';

export default async function SecurityCenterPage() {
  await requireRRASession('super_admin');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Security event counts — last 7 days
  const [secStats] = await db
    .select({
      accessDenied: sql<number>`COUNT(*) FILTER (WHERE ${auditLog.action} LIKE 'ACCESS_DENIED%')::int`.as('accessDenied'),
      roleChanges: sql<number>`COUNT(*) FILTER (WHERE ${auditLog.action} LIKE 'STAFF_ROLE%')::int`.as('roleChanges'),
      suspiciousFlags: sql<number>`COUNT(*) FILTER (WHERE ${auditLog.action} LIKE 'SUSPICIOUS%')::int`.as('suspiciousFlags'),
      systemConfigChanges: sql<number>`COUNT(*) FILTER (WHERE ${auditLog.action} LIKE '%CONFIG%' OR ${auditLog.action} LIKE 'KPI_TARGET%')::int`.as('systemConfigChanges'),
    })
    .from(auditLog)
    .where(gte(auditLog.createdAt, sevenDaysAgo));

  // Access denials in last 24h
  const [denials24h] = await db
    .select({ count: sql<number>`COUNT(*)::int`.as('count') })
    .from(auditLog)
    .where(sql`${auditLog.action} LIKE 'ACCESS_DENIED%' AND ${auditLog.createdAt} >= ${oneDayAgo}`);

  // Recent permission changes
  const permissionChanges = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.userId,
      targetId: auditLog.targetId,
      targetType: auditLog.targetType,
      beforeState: auditLog.beforeState,
      afterState: auditLog.afterState,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(sql`${auditLog.action} = 'STAFF_ROLE_CHANGED' AND ${auditLog.createdAt} >= ${sevenDaysAgo}`)
    .orderBy(desc(auditLog.createdAt))
    .limit(10);

  // Recent high-priority security events
  const securityEvents = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorId: auditLog.userId,
      targetType: auditLog.targetType,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      sql`${auditLog.action} IN ('ACCESS_DENIED_INSUFFICIENT_ROLE', 'ACCESS_DENIED_UNKNOWN_ROLE', 'STAFF_ROLE_CHANGED', 'SUSPICIOUS_FLAGGED', 'KPI_TARGET_SET') AND ${auditLog.createdAt} >= ${sevenDaysAgo}`
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(25);

  const stats = secStats ?? { accessDenied: 0, roleChanges: 0, suspiciousFlags: 0, systemConfigChanges: 0 };

  function eventSeverity(action: string) {
    if (action.includes('SUSPICIOUS') || action.includes('DENIED')) return 'high';
    if (action.includes('ROLE_CHANGED') || action.includes('CONFIG') || action.includes('KPI_TARGET')) return 'medium';
    return 'info';
  }
  function severityClass(action: string) {
    const s = eventSeverity(action);
    if (s === 'high') return 'border-red-200 text-red-700 bg-red-50/60';
    if (s === 'medium') return 'border-amber-200 text-amber-700 bg-amber-50/60';
    return 'border-blue-200 text-blue-700 bg-blue-50/60';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-rose-500" />
          Security Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Authentication, authorization, and permission change monitoring — last 7 days
        </p>
      </div>

      {/* Security Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-red-500" /> Access Denials
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={`text-2xl font-bold ${stats.accessDenied > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {stats.accessDenied}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {denials24h?.count ?? 0} in last 24h · 7-day total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-amber-500" /> Permission Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={`text-2xl font-bold ${stats.roleChanges > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {stats.roleChanges}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">role/permission edits · 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> Suspicious Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={`text-2xl font-bold ${stats.suspiciousFlags > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
              {stats.suspiciousFlags}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">suspicious activity markers · 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-500" /> Config Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{stats.systemConfigChanges}</div>
            <p className="text-xs text-muted-foreground mt-0.5">system configuration edits · 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Permission Changes Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" /> Recent Permission Changes
          </CardTitle>
          <CardDescription>
            Role and permission modifications — last 7 days · sourced from audit log
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissionChanges.length === 0 ? (
            <div className="py-8 text-center space-y-1">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-medium text-emerald-600">No permission changes</p>
              <p className="text-xs text-muted-foreground">No role modifications in the last 7 days</p>
            </div>
          ) : (
            <div className="divide-y">
              {permissionChanges.map((pc) => (
                <div key={pc.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium">Staff Role Changed</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      Actor: <span className="text-foreground">{pc.actorId ? pc.actorId.slice(0, 8) + '…' : '—'}</span>
                      {' → '}
                      Target: <span className="text-foreground">{pc.targetId ? pc.targetId.slice(0, 8) + '…' : '—'}</span>
                    </p>
                    {pc.beforeState && (
                      <p className="text-xs text-muted-foreground">
                        Before:{' '}
                        <span className="font-mono text-amber-600 text-[10px]">
                          {typeof pc.beforeState === 'object' ? JSON.stringify(pc.beforeState) : String(pc.beforeState)}
                        </span>
                      </p>
                    )}
                    {pc.afterState && (
                      <p className="text-xs text-muted-foreground">
                        After:{' '}
                        <span className="font-mono text-emerald-600 text-[10px]">
                          {typeof pc.afterState === 'object' ? JSON.stringify(pc.afterState) : String(pc.afterState)}
                        </span>
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {pc.createdAt ? new Date(pc.createdAt).toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Event Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Security Event Log
          </CardTitle>
          <CardDescription>
            Access denials, suspicious flags, and system changes — last 7 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {securityEvents.length === 0 ? (
            <div className="py-8 text-center space-y-1">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-medium text-emerald-600">No notable security events</p>
              <p className="text-xs text-muted-foreground">System is clean for the last 7 days</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Event</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Actor</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Target</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Severity</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">IP</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {securityEvents.map((ev) => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-2 font-mono text-[11px] text-foreground">{ev.action}</td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground font-mono">
                        {ev.actorId ? ev.actorId.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{ev.targetType ?? '—'}</td>
                      <td className="py-2.5 px-2">
                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${severityClass(ev.action)}`}>
                          {eventSeverity(ev.action)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground font-mono">
                        {ev.ipAddress ?? '—'}
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">
                        {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
