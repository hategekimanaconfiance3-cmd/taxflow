"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Brain, Building2, Database, KeyRound, Search, ShieldAlert, ShieldCheck, Users, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { getSuperAdminCommandCenter, getSuperAdminControlPlaneSummary, searchSuperAdminCommand } from "@/lib/actions/super-admin-command-center.action";
import type { SuperAdminDashboardComparison, SuperAdminDashboardPeriod } from "@/lib/super-admin-command-center";

type DashboardData = Awaited<ReturnType<typeof getSuperAdminCommandCenter>>;
type ControlPlaneSummary = Awaited<ReturnType<typeof getSuperAdminControlPlaneSummary>>;
type SearchResponse = Awaited<ReturnType<typeof searchSuperAdminCommand>>;
type SearchResult = SearchResponse["results"][number];

function dateLabel(value: string | null) {
  if (!value) return "No source records";
  return new Intl.DateTimeFormat("en-RW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }).format(new Date(value));
}

function Metric({ label, value, detail, source, icon: Icon }: { label: string; value: string; detail: string; source: string; icon: typeof Building2 }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div><CardDescription>{label}</CardDescription><CardTitle className="mt-2 text-2xl">{value}</CardTitle></div>
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent><p className="text-xs text-muted-foreground">{detail}</p><p className="mt-1 text-[11px] text-muted-foreground/75">Source: {source}</p></CardContent>
    </Card>
  );
}

function SuperAdminCommandSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setUnavailableSources([]);
    if (query.trim().length < 2) {
      setMessage("Enter at least two characters.");
      return;
    }
    startTransition(async () => {
      try {
        const found = await searchSuperAdminCommand(query);
        setResults(found.results);
        setUnavailableSources(found.unavailableSources);
        setMessage(found.results.length ? null : found.unavailableSources.length === 8 ? "All search sources are unavailable. Retry in a moment." : found.unavailableSources.length ? "No matches in the sources that were available." : "No matching businesses, products, transactions, signals, cases, admins, tickets, or audit events.");
      } catch {
        setResults([]);
        setUnavailableSources([]);
        setMessage("Command search is temporarily unavailable. Try again.");
      }
    });
  }

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} className="flex gap-2" role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-9" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Find a business, product, transaction, risk signal, or case" aria-label="Search TaxFlow records" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</Button>
      </form>
      {message && <p className="mt-1 text-xs text-muted-foreground" role="status">{message}</p>}
      {unavailableSources.length > 0 && <p className="mt-1 text-xs text-amber-700" role="status">{unavailableSources.length === 8 ? "Search unavailable" : "Partial results"}: could not search {unavailableSources.join(", ")}.</p>}
      {results.length > 0 && (
        <Card className="mt-2 max-h-72 overflow-auto">
          <CardContent className="p-2">
            {results.map((result) => <Link key={result.kind + result.id} href={result.href} className="flex items-start justify-between gap-3 rounded-md p-2 hover:bg-accent">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.detail}</span></span>
              <Badge variant="outline">{result.kind}</Badge>
            </Link>)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function openAssistant() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true, bubbles: true }));
}

export function SuperAdminCommandCenter({ data, error, period, comparison, from, to, controlPlane, controlPlaneError }: {
  data: DashboardData | null;
  error: string | null;
  controlPlane: ControlPlaneSummary | null;
  controlPlaneError: string | null;
  period: SuperAdminDashboardPeriod;
  comparison: SuperAdminDashboardComparison;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const chart = data?.transactions.series.map((row) => ({
    ...row,
    label: new Intl.DateTimeFormat("en-RW", {
      month: "short",
      day: "numeric",
      ...(period === "today" ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
      timeZone: "Africa/Kigali",
    }).format(new Date(row.date)),
  })) ?? [];
  const highRiskCount = data?.risks.filter((risk) => risk.severity === "critical" || risk.severity === "high").length ?? 0;

  return (
    <main className="flex flex-col gap-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-4">
          <div className="min-w-0 w-full">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">TaxFlow · Super Admin</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Revenue Intelligence Command Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">Recorded system activity, evidence-linked review signals, and investigation entry points.</p>
            <div className="mt-4"><SuperAdminCommandSearch /></div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form action="/admin/dashboard/overview" method="get" className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">Period
                <select name="period" defaultValue={period} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="custom">Custom</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Compare
                <select name="comparison" defaultValue={comparison} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="previous_period">Previous period</option><option value="previous_month">Previous month</option><option value="previous_year">Previous year</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">From<input name="from" type="date" defaultValue={from} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" /></label>
              <label className="grid gap-1 text-xs text-muted-foreground">To<input name="to" type="date" defaultValue={to} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" /></label>
              <Button type="submit" variant="secondary">Apply</Button>
            </form>
            <Button type="button" variant="outline" onClick={openAssistant}><Brain data-icon="inline-start" /> Ask TaxFlow Intelligence</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Super Admin control plane">
        <Link href="/admin/settings#staff-management" className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Admin Management</p><Users className="size-4 text-muted-foreground" /></div>
          <p className="mt-2 text-2xl font-semibold">{controlPlane ? controlPlane.activeAdministrators + " / " + controlPlane.administrators : "Unavailable"}</p>
          <p className="text-xs text-muted-foreground">Active / total RRA staff accounts · manage roles and status</p>
        </Link>
        <Link href="/admin/security" className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Security Center</p><ShieldCheck className="size-4 text-muted-foreground" /></div>
          <p className="mt-2 text-2xl font-semibold">{controlPlane ? controlPlane.currentStaffSessions : "Unavailable"}</p>
          <p className="text-xs text-muted-foreground">Unexpired staff sessions · login history and API telemetry unavailable</p>
        </Link>
        <Link href="/admin/security" className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Permission Changes</p><KeyRound className="size-4 text-muted-foreground" /></div>
          <p className="mt-2 text-2xl font-semibold">{controlPlane ? controlPlane.roleChangesLast30Days : "Unavailable"}</p>
          <p className="text-xs text-muted-foreground">Role-change audit records in the last 30 days</p>
        </Link>
        {controlPlaneError && <p className="text-xs text-destructive md:col-span-3" role="status">Control-plane summary unavailable. Open Security Center to retry with a fresh page load.</p>}
      </section>

      {error && <Card className="border-destructive/50"><CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm text-destructive"><Database aria-hidden="true" /><span role="alert">{error}</span><Button className="ml-auto" variant="outline" size="sm" onClick={() => router.refresh()}>Retry</Button></CardContent></Card>}

      {data && <>
        <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <Badge variant="secondary"><Database data-icon="inline-start" /> Database query succeeded</Badge>
          <Badge variant="secondary"><Activity data-icon="inline-start" /> Persisted intelligence available</Badge>
          <span className="text-muted-foreground">Period: {data.period.label}</span>
          <span className="text-muted-foreground">Newest record: {dateLabel(data.sourceFreshness[0] ?? null)}</span>
          <span className="ml-auto text-muted-foreground">Refreshed {dateLabel(data.refreshedAt)}</span>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="National system overview">
          <Metric label="Registered businesses" value={data.businesses.total.toLocaleString()} detail={data.businesses.active.toLocaleString() + " active · " + data.businesses.suspended.toLocaleString() + " suspended"} source="TaxFlow trader accounts; current status snapshot." icon={Building2} />
          <Metric label="Recorded transactions" value={data.transactions.total.toLocaleString()} detail={data.transactions.confirmed.toLocaleString()} source="Transaction rows created in selected period, across statuses." icon={Activity} />
          <Metric label="Output VAT recorded" value={formatRWF(data.tax.output)} detail={data.period.label + " · VAT output records"} source={data.definitions.vat} icon={Database} />
          <Metric label="Confirmed tax payments" value={formatRWF(data.tax.payments)} detail={data.tax.paymentCount.toLocaleString() + " confirmed payment records"} source={data.definitions.payment} icon={ShieldAlert} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity /> Transaction intelligence</CardTitle><CardDescription>Recorded counts in time windows and the selected-period trend. A query error is shown separately from zero activity.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[["5 minutes", data.transactions.windows.five], ["15 minutes", data.transactions.windows.fifteen], ["1 hour", data.transactions.windows.hour], ["Today", data.transactions.today.count]].map(([label, count]) =>
                  <div key={String(label)} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Last {label}</p><p className="mt-1 font-semibold">{Number(count).toLocaleString()} transactions</p></div>)}
              </div>
              {chart.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No recorded transactions in the selected period.</div> : <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={24} /><YAxis allowDecimals={false} /><Tooltip formatter={(value) => [Number(value).toLocaleString(), "Transactions"]} /><Area type="monotone" dataKey="count" name="Transactions" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.16} /></AreaChart></ResponsiveContainer>
              </div>}
              <p className="text-xs text-muted-foreground">Confirmed/completed seller value: {formatRWF(data.transactions.confirmedValue)} · {data.transactions.comparison}.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert /> Risk &amp; anomaly center</CardTitle><CardDescription>Stored unresolved findings; an alert is a review signal, not an official decision.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">High-priority signals in view</span><Badge variant={!data.riskSourceAvailable ? "outline" : highRiskCount ? "destructive" : "secondary"}>{data.riskSourceAvailable ? highRiskCount : "Unavailable"}</Badge></div>
              {!data.riskSourceAvailable ? <p className="rounded-md border border-dashed p-5 text-center text-sm text-amber-700">Risk findings are unavailable. Apply the AI findings database migration and retry.</p> : data.risks.length === 0 ? <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No unresolved signals recorded in this period.</p> : data.risks.slice(0, 6).map((risk) =>
                <Link key={risk.id} href={risk.businessId ? "/admin/directory/business/" + risk.businessId : "/admin/analytics"} className="rounded-md border p-3 hover:bg-accent/50">
                  <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{risk.business}</p><p className="text-xs capitalize text-muted-foreground">{risk.type.replaceAll("_", " ")} · {dateLabel(risk.at)}</p></div><Badge variant={risk.severity === "critical" || risk.severity === "high" ? "destructive" : "outline"}>{risk.severity}</Badge></div>
                  <p className="mt-2 line-clamp-2 text-sm">{risk.reason}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Observed {risk.observed ?? "not recorded"} · Expected {risk.expected ?? "not recorded"} · Evidence IDs: {risk.evidence.join(", ") || "No linked IDs recorded"}</p>
                  <p className="mt-2 text-xs font-medium">AI Recommendation — Human Review Required.</p>
                </Link>)}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Tax intelligence</CardTitle><CardDescription>Selected-period values from recorded tax rows. This is not official liability.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Output VAT recorded</p><p className="mt-1 text-lg font-semibold">{formatRWF(data.tax.output)}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Input VAT recorded</p><p className="mt-1 text-lg font-semibold">{formatRWF(data.tax.input)}</p></div>
              <div className="rounded-md border p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Confirmed payment records</p><p className="mt-1 text-lg font-semibold">{formatRWF(data.tax.payments)}</p><p className="mt-1 text-xs text-muted-foreground">{data.tax.comparison}</p></div>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle>Business intelligence</CardTitle><CardDescription>Top recorded seller transaction value in the selected period.</CardDescription></CardHeader>
            <CardContent>{data.businessesByValue.length === 0 ? <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Not enough data for a business ranking.</p> :
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2">Business</th><th className="pb-2">Role</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Value</th></tr></thead><tbody>{data.businessesByValue.map((business) => <tr key={business.id} className="border-b last:border-0"><td className="py-2"><Link className="font-medium hover:underline" href={"/admin/directory/business/" + business.id}>{business.name}</Link><span className="block font-mono text-xs text-muted-foreground">{business.tin ?? "TIN unavailable"}</span></td><td className="py-2 capitalize">{business.role}</td><td className="py-2 text-right">{business.transactions.toLocaleString()}</td><td className="py-2 text-right">{formatRWF(business.value)}</td></tr>)}</tbody></table></div>}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Warehouse /> Stock &amp; production</CardTitle><CardDescription>Recorded stock snapshot, appended movements, and manufacturer-declared production.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2"><div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Current stock units</p><p className="mt-1 font-semibold">{data.stock.units.toLocaleString()}</p></div><div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Declared production</p><p className="mt-1 font-semibold">{data.production.declaredUnits.toLocaleString()}</p><p className="text-xs text-muted-foreground">{data.production.batches} batches</p></div><div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Businesses with stock</p><p className="mt-1 font-semibold">{data.stock.businesses.toLocaleString()}</p></div></div>
              {data.stock.movements.length === 0 ? <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No stock movement records in this period.</p> : data.stock.movements.slice(0, 5).map((movement, index) => <Link key={movement.businessId + movement.productId + index} href={"/admin/stock?business=" + encodeURIComponent(movement.businessId)} className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent/50"><span><span className="block font-medium">{movement.business}</span><span className="text-xs text-muted-foreground">{movement.count} recorded stock movement(s)</span></span><Badge variant="outline">{movement.delta > 0 ? "+" : ""}{movement.delta.toLocaleString()} units</Badge></Link>)}
              <p className="text-xs text-muted-foreground">{data.definitions.stock} {data.definitions.production}</p>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database /> Data quality &amp; intelligence brief</CardTitle><CardDescription>Summarized from actual TaxFlow records.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">Open data-quality findings</span><Badge variant={data.dataQuality ? "outline" : "secondary"}>{data.dataQuality === null ? "Unavailable" : data.dataQuality}</Badge></div>
              <div className="rounded-md bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded activity brief · {data.period.label}</p><ul className="mt-2 flex flex-col gap-2 text-sm"><li>{data.riskSourceAvailable ? data.risks.length + " unresolved stored finding(s) fall in the selected period." : "Stored findings are unavailable; see the risk source status."}</li><li>{data.dataQuality === null ? "Data-quality finding count is unavailable." : data.dataQuality + " unresolved data-quality finding(s) are stored."}</li><li>{data.transactions.total.toLocaleString()} transactions were recorded; confirmed/completed value is {formatRWF(data.transactions.confirmedValue)}.</li><li>{data.production.batches} production batches declare {data.production.declaredUnits.toLocaleString()} units.</li></ul></div>
              <p className="text-xs text-muted-foreground">This is a deterministic summary, not generated AI analysis. Open the existing assistant for evidence-based questions; recommendations require human review.</p>
            </CardContent>
          </Card>
        </section>
      </>}
    </main>
  );
}
