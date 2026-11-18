"use client";

import { useState, type FormEvent } from "react";
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
  merchantProvince: string | null;
  merchantDistrict: string | null;
  status: string;
  assignmentStatus: string;
  createdAt: string;
};

const money = (value: number) => `${value.toLocaleString()} RWF`;

export function PriceAlertWorkspace({ initialAlerts }: { initialAlerts: AlertRow[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");
  const [district, setDistrict] = useState("");
  const [tin, setTin] = useState("");
  const [product, setProduct] = useState("");
  const [minPercentage, setMinPercentage] = useState("");
  const [maxPercentage, setMaxPercentage] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function applyFilters(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries({ direction, status, district, tin, product, minPercentage, maxPercentage, from, to })) if (value) query.set(key, value);
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

  async function submit(alertId: string, action: "review" | "escalate") {
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
      setAlerts((current) => current.map((item) => item.id === alertId ? { ...item, status: action === "review" ? "reviewed" : "escalated" } : item));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The alert action could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Price-change monitoring</CardTitle>
          <p className="text-sm text-muted-foreground">Alerts are limited to your assigned jurisdiction and permissions. A change is evidence for review, not a finding of wrongdoing.</p>
        </CardHeader>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-4 lg:grid-cols-9">
            <select aria-label="Price direction" value={direction} onChange={(event) => setDirection(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All directions</option><option value="increase">Increases</option><option value="decrease">Decreases</option></select>
            <select aria-label="Review status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">All statuses</option><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="escalated">Escalated</option></select>
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
                          <p className="font-medium">{alert.productName} · {alert.merchantName ?? "Unknown merchant"}</p>
                          <p className="text-xs text-muted-foreground">TIN {alert.tinNumber ?? "unavailable"} · {alert.merchantDistrict ?? "District unavailable"}, {alert.merchantProvince ?? "Province unavailable"} · {new Date(alert.createdAt).toLocaleString("en-GB")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
                    {alert.status === "pending" || alert.status === "escalated" ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={reasons[alert.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [alert.id]: event.target.value }))} placeholder="Reason required for the administrative action" className="sm:max-w-md" />
                        <Button variant="outline" disabled={Boolean(busy) || (reasons[alert.id]?.trim().length ?? 0) < 5} onClick={() => submit(alert.id, "review")}>
                          {busy === `${alert.id}:review` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Mark reviewed
                        </Button>
                        <Button variant="outline" disabled={Boolean(busy) || (reasons[alert.id]?.trim().length ?? 0) < 5} onClick={() => submit(alert.id, "escalate")}>
                          {busy === `${alert.id}:escalate` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}Escalate
                        </Button>
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

