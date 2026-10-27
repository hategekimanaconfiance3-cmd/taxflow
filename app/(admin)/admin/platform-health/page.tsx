import { Activity, Clock3, Database, Radio, Server, ShieldCheck } from "lucide-react";
import { getSuperAdminPlatformHealth } from "@/lib/actions/super-admin-platform-health.action";
import { requireRRASession } from "@/lib/auth-guard";
import { PlatformHealthRefresh } from "@/components/admin/platform-health-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HealthData = Awaited<ReturnType<typeof getSuperAdminPlatformHealth>>;
function label(status: string) { return status === "healthy" ? "Healthy" : status === "unavailable" ? "Unavailable" : "Not configured"; }
function variant(status: string): "secondary" | "destructive" | "outline" { return status === "healthy" ? "secondary" : status === "unavailable" ? "destructive" : "outline"; }
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }).format(new Date(value)) : "No records"; }

export default async function PlatformHealthPage() {
  await requireRRASession("super_admin");
  let health: HealthData | null = null;
  let error: string | null = null;
  try { health = await getSuperAdminPlatformHealth(); }
  catch { error = "Health checks could not be loaded. The current session or database check failed."; }
  return <main className="space-y-5">
    <PlatformHealthRefresh />
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">TaxFlow · Super Admin</p><h1 className="mt-2 text-2xl font-semibold">Platform Health</h1><p className="mt-1 text-sm text-muted-foreground">Application signals measured from current infrastructure and database records. Refreshed every 60 seconds.</p></header>
    {error && <Card className="border-destructive/50"><CardContent className="py-4 text-sm text-destructive" role="alert">{error}</CardContent></Card>}
    {health && <>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Checked {dateLabel(health.checkedAt)}</Badge><Badge variant="secondary">Session guard passed</Badge></div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard title="Database" icon={<Database className="size-4" />} status={health.database.status} detail={`${health.database.detail}${health.database.latencyMs === undefined ? "" : ` ${health.database.latencyMs} ms`}`} />
        <HealthCard title="Authentication" icon={<ShieldCheck className="size-4" />} status={health.authentication.status} detail={health.authentication.detail} />
        <HealthCard title="Realtime broker" icon={<Radio className="size-4" />} status={health.realtime.status} detail={`${health.realtime.detail}${health.realtime.latencyMs === undefined ? "" : ` ${health.realtime.latencyMs} ms`}`} />
        <HealthCard title="Background jobs" icon={<Server className="size-4" />} status={health.backgroundJobs.status} detail={health.backgroundJobs.detail} />
        <HealthCard title="Integrations" icon={<Activity className="size-4" />} status={health.integrations.status} detail={health.integrations.detail} />
        <Card><CardHeader className="flex flex-row items-center justify-between gap-3 pb-2"><CardDescription>Current staff sessions</CardDescription><Clock3 className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-semibold">{health.currentStaffSessions === null ? "Unavailable" : health.currentStaffSessions.toLocaleString()}</p><p className="text-xs text-muted-foreground">Unexpired sessions at check time</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Latest transaction record</CardDescription><CardTitle className="text-base">{dateLabel(health.lastTransactionAt)}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{health.transactionTelemetryAvailable ? "Database freshness indicator; not an API uptime measure." : "Transaction source unavailable."}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Latest notification record</CardDescription><CardTitle className="text-base">{dateLabel(health.lastNotificationAt)}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{health.notificationTelemetryAvailable ? "Stored notification timestamp; delivery is not verified." : "Notification source unavailable."}</p></CardContent></Card>
      </section>
    </>}
  </main>;
}

function HealthCard({ title, icon, status, detail }: { title: string; icon: React.ReactNode; status: string; detail: string }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-3 pb-2"><CardDescription>{title}</CardDescription><span className="text-muted-foreground">{icon}</span></CardHeader><CardContent><Badge variant={variant(status)}>{label(status)}</Badge><p className="mt-2 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}
