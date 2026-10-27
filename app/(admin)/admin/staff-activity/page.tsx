import Link from "next/link";
import { Activity, Download, Search } from "lucide-react";
import { getStaffActivity } from "@/lib/admin-staff-activity";
import { requireRRASession } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function prettyDate(date: Date) { return new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }).format(date); }

export default async function StaffActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRRASession("super_admin");
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const requested = {
    period: first(params.period) ?? "7d",
    from: first(params.from),
    to: first(params.to),
    staffRecordId: first(params.staffRecordId),
  };
  let activity: Awaited<ReturnType<typeof getStaffActivity>> | null = null;
  let error: string | null = null;
  try { activity = await getStaffActivity(requested); }
  catch (caught) { error = caught instanceof Error ? caught.message : "Staff activity could not be loaded. Retry the page."; }
  const selectedPeriod = requested.period === "30d" || requested.period === "custom" ? requested.period : "7d";
  const exportQuery = new URLSearchParams({ period: selectedPeriod });
  if (requested.from) exportQuery.set("from", requested.from);
  if (requested.to) exportQuery.set("to", requested.to);
  if (requested.staffRecordId) exportQuery.set("staffRecordId", requested.staffRecordId);

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">TaxFlow · Super Admin</p><h1 className="mt-2 text-2xl font-semibold">Staff Activity</h1><p className="mt-1 text-sm text-muted-foreground">Review actions recorded in the audit log. Reads without an audit event are not represented here.</p></div>
      {activity ? <Button asChild variant="outline"><a href={`/api/admin/staff-activity/export?${exportQuery.toString()}`}><Download data-icon="inline-start" />Export CSV</a></Button> : <Button type="button" variant="outline" disabled><Download data-icon="inline-start" />Export CSV</Button>}
    </header>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="size-4" />Filter audit events</CardTitle></CardHeader><CardContent>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">Time range<select name="period" defaultValue={selectedPeriod} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option></select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">From<input type="date" name="from" defaultValue={requested.from ?? (activity ? isoDate(activity.from) : "")} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To<input type="date" name="to" defaultValue={requested.to ?? (activity ? isoDate(activity.to) : "")} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" /></label>
        <label className="grid min-w-56 gap-1 text-xs text-muted-foreground">Staff member<select name="staffRecordId" defaultValue={requested.staffRecordId ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"><option value="">All staff</option>{activity?.staff.map((member) => <option key={member.id} value={member.id}>{member.staffId} · {member.name}</option>)}</select></label>
        <Button type="submit">Apply filters</Button>
      </form>
    </CardContent></Card>

    {error && <Card className="border-destructive/50"><CardContent className="py-4 text-sm text-destructive" role="alert">{error}</CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="size-4" />Recorded activity {activity ? `(${activity.events.length})` : ""}</CardTitle><CardDescription>{activity ? `${prettyDate(activity.from)} – ${prettyDate(activity.to)} · newest first` : "Activity unavailable"}</CardDescription></CardHeader><CardContent className="p-0">
      {!activity || activity.events.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No audit events found for these filters.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Time</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Recorded change / context</th></tr></thead><tbody>{activity.events.map((event) => <tr key={event.id} className="border-b align-top last:border-0"><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{prettyDate(event.createdAt)}</td><td className="px-4 py-3"><span className="font-medium">{event.actor}</span><span className="block text-xs text-muted-foreground">{event.staffId} · {event.email}</span></td><td className="px-4 py-3"><Badge variant="outline" className="font-mono text-[10px]">{event.action}</Badge></td><td className="px-4 py-3 text-xs text-muted-foreground">{event.targetType ?? "—"}{event.targetId ? <span className="block break-all font-mono">{event.targetId}</span> : null}</td><td className="max-w-sm px-4 py-3 text-xs text-muted-foreground">{event.beforeState || event.afterState ? <span className="block break-words">{JSON.stringify(event.beforeState ?? {})} → {JSON.stringify(event.afterState ?? {})}</span> : null}{event.metadata ? <span className="mt-1 block break-words">{event.metadata}</span> : null}{!event.beforeState && !event.afterState && !event.metadata ? "No additional context was stored." : null}</td></tr>)}</tbody></table></div>}
      {activity && activity.events.length === activity.limit && <p className="border-t p-3 text-xs text-muted-foreground">Showing the newest {activity.limit} events. Narrow the filters to inspect earlier activity.</p>}
    </CardContent></Card>
    <p className="text-xs text-muted-foreground"><Link className="underline underline-offset-4" href="/admin/security">Security Center</Link> · Events reflect only audit records the application currently writes; they do not represent every read or page view.</p>
  </main>;
}
