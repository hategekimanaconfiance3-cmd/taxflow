import Link from "next/link";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { Activity, AlertTriangle, Clock3, Database, ShieldCheck, Users } from "lucide-react";
import db from "@/db/drizzle";
import { auditLog, rraStaff, session, user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STAFF_SECURITY_ACTIONS: string[] = [
  "STAFF_CREATED",
  "STAFF_ROLES_UPDATED",
  "STAFF_ACTIVATED",
  "STAFF_DEACTIVATED",
  "STAFF_PASSWORD_RESET",
  "ACCESS_DENIED_UNKNOWN_ROLE",
  "ACCESS_DENIED_INSUFFICIENT_ROLE",
  "ACCESS_DENIED_MISSING_PERMISSION",
  "ACCESS_DENIED_MISSING_OPERATIONAL_PERMISSION",
] as const;

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Unavailable";
}

export default async function SuperAdminSecurityPage() {
  await requireRRASession("super_admin");
  const now = new Date();
  const [staffCounts, activeSessionCount, activeSessions, securityEvents] = await Promise.all([
    db.select({ total: sql<number>`COUNT(*)::int`, active: sql<number>`COUNT(*) FILTER (WHERE ${rraStaff.isActive})::int` }).from(rraStaff),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(session)
      .innerJoin(rraStaff, eq(rraStaff.userId, session.userId))
      .where(and(eq(rraStaff.isActive, true), gt(session.expiresAt, now))),
    db.select({
      id: session.id,
      staffId: rraStaff.staffId,
      name: user.name,
      email: user.email,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }).from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .innerJoin(rraStaff, eq(rraStaff.userId, user.id))
      .where(and(eq(rraStaff.isActive, true), gt(session.expiresAt, now)))
      .orderBy(desc(session.createdAt)).limit(25),
    db.select({
      id: auditLog.id,
      actor: user.name,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      beforeState: auditLog.beforeState,
      afterState: auditLog.afterState,
      createdAt: auditLog.createdAt,
    }).from(auditLog)
      .innerJoin(user, eq(auditLog.userId, user.id))
      .where(inArray(auditLog.action, STAFF_SECURITY_ACTIONS))
      .orderBy(desc(auditLog.createdAt)).limit(30),
  ]);

  const active = Number(staffCounts[0]?.active ?? 0);
  const total = Number(staffCounts[0]?.total ?? 0);
  const countSessions = Number(activeSessionCount[0]?.count ?? 0);

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">TaxFlow · Super Admin</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Security Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review current staff sessions and recorded administrative security events.</p>
        </div>
        <Link className="text-sm font-medium text-primary hover:underline" href="/admin/settings#staff-management">Open Admin Management</Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Security status summary">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardDescription>Staff accounts</CardDescription><Users className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-semibold">{total}</p><p className="text-xs text-muted-foreground">{active} active · {total - active} inactive</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardDescription>Current staff sessions</CardDescription><Activity className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-semibold">{countSessions}</p><p className="text-xs text-muted-foreground">Unexpired Better Auth sessions at query time</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardDescription>Authentication</CardDescription><ShieldCheck className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-base font-semibold">Session verified</p><p className="text-xs text-muted-foreground">This page requires an active Super Admin session.</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardDescription>Infrastructure telemetry</CardDescription><AlertTriangle className="size-4 text-amber-600" /></CardHeader><CardContent><p className="text-base font-semibold">Unavailable</p><p className="text-xs text-muted-foreground">No login-attempt history, API latency, or integration health records are configured.</p></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-4" />Current staff sessions</CardTitle><CardDescription>These are live session records, not a historical login log. IP addresses and tokens are intentionally omitted.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {activeSessions.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No unexpired staff sessions are recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Session created</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">State</th></tr></thead><tbody>{activeSessions.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-4 py-3"><span className="font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{row.staffId} · {row.email}</span></td><td className="px-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td><td className="px-4 py-3 text-muted-foreground">{formatDate(row.expiresAt)}</td><td className="px-4 py-3"><Badge variant="secondary">Unexpired</Badge></td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4" />Administrative security and permission events</CardTitle><CardDescription>Source: audit_log. Before and after states are shown only when recorded.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {securityEvents.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No matching administrative security events are recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Recorded change</th></tr></thead><tbody>{securityEvents.map((event) => <tr key={event.id} className="border-b last:border-0"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(event.createdAt)}</td><td className="px-4 py-3">{event.actor}</td><td className="px-4 py-3"><Badge variant="outline" className="font-mono text-[10px]">{event.action}</Badge></td><td className="px-4 py-3 text-xs text-muted-foreground">{event.targetType ?? "—"}{event.targetId ? ` · ${event.targetId}` : ""}</td><td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">{event.beforeState || event.afterState ? `${JSON.stringify(event.beforeState ?? {})} → ${JSON.stringify(event.afterState ?? {})}` : "No before/after state stored"}</td></tr>)}</tbody></table></div>}
          <p className="border-t p-4 text-xs text-muted-foreground">Availability is based on persisted audit records. Historical login attempts and API authorization telemetry are not currently stored by this application.</p>
        </CardContent>
      </Card>
    </main>
  );
}
