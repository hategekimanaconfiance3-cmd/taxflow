"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AlertRow = {
  id: string;
  merchantName: string | null;
  tinNumber: string | null;
  productName: string;
  direction: string;
  previousPrice: number;
  newPrice: number;
  differenceRwf: number;
  percentageChange: number;
  severity: string;
  alertReason?: string | null;
  categoryCode?: string | null;
  merchantProvince: string | null;
  merchantDistrict: string | null;
  status: string;
  assignmentStatus: string;
  createdAt: string;
};
type PolicyRow = { id: string; scopeType: string; scopeKey: string; increaseThresholdPercent: number; decreaseThresholdPercent: number; absoluteDifferenceRwf: number; mediumThresholdPercent: number; highThresholdPercent: number; criticalThresholdPercent: number };

const money = (value: number) => `${value.toLocaleString()} RWF`;

export function PriceAlertWorkspace({ initialAlerts, initialPolicies = [], canManagePolicies = false }: { initialAlerts: AlertRow[]; initialPolicies?: PolicyRow[]; canManagePolicies?: boolean }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [district, setDistrict] = useState("");
  const [tin, setTin] = useState("");
  const [product, setProduct] = useState("");
  const [minPercentage, setMinPercentage] = useState("");
  const [maxPercentage, setMaxPercentage] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [policies, setPolicies] = useState(initialPolicies);
  const [policyScopeType, setPolicyScopeType] = useState('default');
  const [policyScopeKey, setPolicyScopeKey] = useState('*');
  const [policyThreshold, setPolicyThreshold] = useState('5');
  const [policyReason, setPolicyReason] = useState('Update price-monitoring threshold policy');

  async function applyFilters(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries({ direction, status, severity, category, district, tin, product, minPercentage, maxPercentage, from, to })) if (value) query.set(key, value);
      const response = await fetch(`/api/admin/price-alerts?${query.toString()}`);
      const body = await response.json() as { alerts?: AlertRow[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Alerts could not be loaded.");
      setAlerts(body.alerts ?? []);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Alerts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(alertId: string, action: "review" | "escalate" | "mark_suspicious" | "resolve") {
    const reason = reasons[alertId]?.trim() ?? "";
    if (reason.length < 5) return;
    setBusy(`${alertId}:${action}`);
    try {
      const response = await fetch(`/api/admin/price-alerts/${alertId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!response.ok) throw new Error("The alert action could not be saved.");
      const nextStatus = action === "review" ? "reviewed" : action === "escalate" ? "escalated" : action === "mark_suspicious" ? "suspicious" : "resolved";
      setAlerts((current) => current.map((item) => item.id === alertId ? { ...item, status: nextStatus } : item));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The alert action could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function savePolicy() {
    const threshold = Number(policyThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) return;
    const response = await fetch('/api/admin/price-monitoring/policies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scopeType: policyScopeType, scopeKey: policyScopeType === 'default' ? '*' : policyScopeKey, increaseThresholdPercent: threshold, decreaseThresholdPercent: threshold, absoluteDifferenceRwf: 0, mediumThresholdPercent: Math.max(threshold, 10), highThresholdPercent: Math.max(threshold, 20), criticalThresholdPercent: Math.max(threshold, 50), reason: policyReason }) });
    const body = await response.json() as { policy?: PolicyRow; error?: string };
    if (!response.ok || !body.policy) { window.alert(body.error ?? 'Policy could not be saved.'); return; }
    setPolicies((current) => [...current.filter((item) => !(item.scopeType === body.policy!.scopeType && item.scopeKey === body.policy!.scopeKey)), body.policy!]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([['Total alerts', alerts.length], ['Critical', alerts.filter((item) => item.severity === 'critical').length], ['High', alerts.filter((item) => item.severity === 'high').length], ['Increases', alerts.filter((item) => item.direction === 'increase').length], ['Pending review', alerts.filter((item) => item.status === 'pending').length]] as const).map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>)}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Price-change monitoring</CardTitle>
          <p className="text-sm text-muted-foreground">Alerts are limited to your assigned jurisdiction and permissions. A change is evidence for review, not a finding of wrongdoing.</p>
        </CardHeader>
      </Card>
      {canManagePolicies && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Monitoring policy</CardTitle><p className="text-sm text-muted-foreground">Configure the minimum percentage change that creates an alert. Product and category policies override the default.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-5"><select value={policyScopeType} onChange={(event) => { setPolicyScopeType(event.target.value); setPolicyScopeKey(event.target.value === 'default' ? '*' : ''); }} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="default">Global default</option><option value="category">Product category</option><option value="product">Product</option></select><Input value={policyScopeKey} disabled={policyScopeType === 'default'} onChange={(event) => setPolicyScopeKey(event.target.value)} placeholder="Category code or product ID" /><Input type="number" min="0" step="0.01" value={policyThreshold} onChange={(event) => setPolicyThreshold(event.target.value)} placeholder="Alert threshold %" /><Input value={policyReason} onChange={(event) => setPolicyReason(event.target.value)} placeholder="Reason" /><Button type="button" onClick={savePolicy}>Save policy</Button><p className="md:col-span-5 text-xs text-muted-foreground">Active policies: {policies.map((policy) => `${policy.scopeType}:${policy.scopeKey} ≥ ${policy.increaseThresholdPercent}%`).join(' · ') || 'none configured; defaults apply'}</p></CardContent></Card>}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-4 lg:grid-cols-9">
            <select aria-label="Price direction" value={direction} onChange={(event) => setDirection(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All directions</option><option value="increase">Increases</option><option value="decrease">Decreases</option></select>
            <select aria-label="Review status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All statuses</option><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="escalated">Escalated</option><option value="suspicious">Suspicious</option><option value="resolved">Resolved</option></select>
            <select aria-label="Alert severity" value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All severities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
            <Input aria-label="Product category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
            <Input aria-label="Merchant TIN" value={tin} onChange={(event) => setTin(event.target.value)} placeholder="Merchant TIN" />
            <Input aria-label="Product" value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Product" />
            <Input aria-label="District" value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="District" />
            <Input aria-label="Minimum percentage change" type="number" step="0.01" value={minPercentage} onChange={(event) => setMinPercentage(event.target.value)} placeholder="Min %" />
            <Input aria-label="Maximum percentage change" type="number" step="0.01" value={maxPercentage} onChange={(event) => setMaxPercentage(event.target.value)} placeholder="Max %" />
            <Input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            <Button type="submit" disabled={loading} className="md:col-span-4 lg:col-span-1">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply filters"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {alerts.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No price-change alerts are visible in your scope.</p> : (
            <div className="divide-y">
              {alerts.map((alert) => {
                const increase = alert.direction === "increase";
                return (
                  <div key={alert.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {increase ? <ArrowUpRight className="mt-1 h-5 w-5 text-amber-600" /> : <ArrowDownRight className="mt-1 h-5 w-5 text-blue-600" />}
                        <div>
                          <p className="font-medium"><Link href={`/admin/price-alerts/${alert.id}`} className="underline-offset-4 hover:underline">{alert.productName} · {alert.merchantName ?? "Unknown merchant"}</Link></p>
                          <p className="text-xs text-muted-foreground">TIN {alert.tinNumber ?? "unavailable"} · {alert.merchantDistrict ?? "District unavailable"}, {alert.merchantProvince ?? "Province unavailable"} · {new Date(alert.createdAt).toLocaleString("en-GB")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{alert.severity}</Badge>
                        <Badge variant="outline" className="capitalize">{alert.status}</Badge>
                        <Badge variant="outline" className={alert.assignmentStatus === "assigned" ? "text-emerald-700" : "text-amber-700"}>
                          {alert.assignmentStatus === "assigned" ? "Assigned" : "Unassigned"}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-muted-foreground">Previous</p><p className="font-medium">{money(alert.previousPrice)}</p></div>
                      <div><p className="text-xs text-muted-foreground">New</p><p className="font-medium">{money(alert.newPrice)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Difference</p><p className={increase ? "font-medium text-amber-700" : "font-medium text-blue-700"}>{alert.differenceRwf > 0 ? "+" : ""}{money(alert.differenceRwf)} </p></div>
                      <div><p className="text-xs text-muted-foreground">Percentage</p><p className="font-medium">{alert.percentageChange > 0 ? "+" : ""}{alert.percentageChange.toFixed(2)}%</p></div>
                    </div>
                    {alert.alertReason && <p className="text-xs text-muted-foreground">Reason: {alert.alertReason}</p>}
                    {alert.status === "pending" || alert.status === "escalated" ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={reasons[alert.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [alert.id]: event.target.value }))} placeholder="Reason required for the administrative action" className="sm:max-w-md" />
                        <Button variant="outline" disabled={Boolean(busy) || (reasons[alert.id]?.trim().length ?? 0) < 5} onClick={() => submit(alert.id, "review")}>
                          {busy === `${alert.id}:review` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Mark reviewed
                        </Button>
                        <Button variant="outline" disabled={Boolean(busy) || (reasons[alert.id]?.trim().length ?? 0) < 5} onClick={() => submit(alert.id, "escalate")}>
                          {busy === `${alert.id}:escalate` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}Escalate
                        </Button>
                        <Button variant="outline" disabled={Boolean(busy) || (reasons[alert.id]?.trim().length ?? 0) < 5} onClick={() => submit(alert.id, "mark_suspicious")}>Mark suspicious</Button>
                        <Button variant="outline" disabled={Boolean(busy) || (reasons[alert.id]?.trim().length ?? 0) < 5} onClick={() => submit(alert.id, "resolve")}>Resolve</Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

