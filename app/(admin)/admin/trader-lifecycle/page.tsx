import Link from "next/link";
import { AlertTriangle, Clock3, Users, UserX } from "lucide-react";
import { getSuperAdminTraderLifecycle } from "@/lib/actions/super-admin-lifecycle.action";
import { requireRRASession } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(date: Date) { return new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeZone: "Africa/Kigali" }).format(date); }

export default async function TraderLifecyclePage() {
  await requireRRASession("super_admin");
  const data = await getSuperAdminTraderLifecycle();
  return <main className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">TaxFlow · Super Admin</p><h1 className="mt-2 text-2xl font-semibold">Trader Lifecycle</h1><p className="mt-1 text-sm text-muted-foreground">Registration, clearance, and recorded transaction stages from existing TaxFlow records.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Summary label="Registered traders" value={data.total.toLocaleString()} icon={<Users className="size-4" />} />
      <Summary label="Pending clearance" value={data.statuses.pending.toLocaleString()} icon={<Clock3 className="size-4" />} />
      <Summary label="Approved" value={data.statuses.approved.toLocaleString()} icon={<Users className="size-4" />} />
      <Summary label="Under review" value={data.statuses.underReview.toLocaleString()} icon={<AlertTriangle className="size-4" />} />
      <Summary label="Suspended" value={data.statuses.suspended.toLocaleString()} icon={<UserX className="size-4" />} />
    </section>
    <section className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardDescription>Registration to approval</CardDescription><CardTitle className="text-2xl">{data.averageDaysToApproval === null ? "Unavailable" : `${data.averageDaysToApproval.toFixed(1)} days`}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Calculated from {data.approvalDurationsCount} recorded first-approval audit events. Older approvals without an audit event are excluded.</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Pending over 7 days</CardDescription><CardTitle className="text-2xl">{data.pendingOverdueCount.toLocaleString()}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Newest 50 overdue registrations are listed below.</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Approved, no confirmed transaction</CardDescription><CardTitle className="text-2xl">{data.dormantApprovedCount.toLocaleString()}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Based on current transaction records; up to 50 businesses are displayed.</CardContent></Card>
    </section>
    <Card><CardHeader><CardTitle className="text-base">Pending clearance over 7 days</CardTitle><CardDescription>Human review queue; this page does not approve or suspend taxpayers.</CardDescription></CardHeader><CardContent className="p-0">
      {data.pendingOverdue.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No pending registrations are older than seven days.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Business</th><th className="px-4 py-3">TIN</th><th className="px-4 py-3">Registered</th><th className="px-4 py-3">Current status</th></tr></thead><tbody>{data.pendingOverdue.map((trader) => <tr key={trader.id} className="border-b last:border-0"><td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/admin/directory/business/${trader.id}`}>{trader.displayName ?? "Unnamed business"}</Link><span className="block text-xs capitalize text-muted-foreground">{trader.role}</span></td><td className="px-4 py-3 font-mono text-xs">{trader.tin ?? "—"}</td><td className="px-4 py-3 text-muted-foreground">{formatDate(trader.registeredAt)}</td><td className="px-4 py-3"><Badge variant="outline">{trader.status.replaceAll("_", " ")}</Badge></td></tr>)}</tbody></table></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Approved businesses without confirmed sales</CardTitle><CardDescription>Only confirmed/completed seller-side transactions count as activity.</CardDescription></CardHeader><CardContent className="p-0">
      {data.dormantApproved.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No approved businesses without a confirmed/completed transaction.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Business</th><th className="px-4 py-3">TIN</th><th className="px-4 py-3">Registration date</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{data.dormantApproved.map((trader) => <tr key={trader.id} className="border-b last:border-0"><td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/admin/directory/business/${trader.id}`}>{trader.displayName ?? "Unnamed business"}</Link><span className="block text-xs capitalize text-muted-foreground">{trader.role}</span></td><td className="px-4 py-3 font-mono text-xs">{trader.tin ?? "—"}</td><td className="px-4 py-3 text-muted-foreground">{formatDate(trader.createdAt)}</td><td className="px-4 py-3"><Badge variant="secondary">Approved</Badge></td></tr>)}</tbody></table></div>}
    </CardContent></Card>
    <p className="text-xs text-muted-foreground">Recorded reinstatements in the last 30 days: {data.reinstatementsLast30Days}. Re-activation requests are not modeled as a distinct workflow in the current schema.</p>
  </main>;
}

function Summary({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-2 pb-2"><CardDescription>{label}</CardDescription><span className="text-muted-foreground">{icon}</span></CardHeader><CardContent><p className="text-2xl font-semibold">{value}</p></CardContent></Card>;
}
