import { getIntelligenceDashboard } from "@/lib/actions/intelligence.action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Activity, CircleCheck, Clock3, CreditCard, ShieldAlert } from "lucide-react";

const money = (value: number) => `${Math.round(value).toLocaleString("en-RW")} RWF`;

const severityVariant: Record<string, "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export default async function IntelligencePage() {
  const data = await getIntelligenceDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Tax Intelligence</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Explainable checks across your transactions, inventory, payments, and recorded tax position.
          </p>
        </div>
        <Badge variant="outline">Read-only review</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Review alerts</CardDescription><CardTitle className="text-3xl">{data.summary.totalAlerts}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Generated from up to 250 recent transactions and stock rows.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>High priority</CardDescription><CardTitle className="text-3xl">{data.summary.high}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Needs human review; not a fraud determination.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending transactions</CardDescription><CardTitle className="text-3xl">{data.summary.pendingTransactions}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Includes buyer/seller transactions awaiting confirmation.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Payment records to review</CardDescription><CardTitle className="text-3xl">{data.summary.pendingOrRejectedPayments}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Pending or rejected records are not treated as settled by this view.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {data.compliance.isCompliant ? <CircleCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
            Recorded tax position
          </CardTitle>
          <CardDescription>Calculated from current TaxFlow records and its configured compliance threshold; this is not an official RRA assessment.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Recorded net amount owed</p><p className="mt-1 text-lg font-semibold">{money(data.compliance.netOwed)}</p></div>
          <div><p className="text-xs text-muted-foreground">Confirmed payment records</p><p className="mt-1 text-lg font-semibold">{money(data.compliance.totalPaid)}</p></div>
          <div><p className="text-xs text-muted-foreground">Outstanding estimate</p><p className="mt-1 text-lg font-semibold">{money(data.compliance.outstanding)}</p></div>
          <div><p className="text-xs text-muted-foreground">Recorded coverage / threshold</p><p className="mt-1 text-lg font-semibold">{data.compliance.compliancePct}% / {data.compliance.threshold}%</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Review queue</CardTitle>
          <CardDescription>
            {data.alerts.length} explainable alert(s). Review the underlying source record before making corrections or decisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border p-5 text-sm text-muted-foreground">
              <CircleCheck className="h-5 w-5 text-emerald-600" />
              No issues were detected by the currently enabled rules in the records scanned.
            </div>
          ) : data.alerts.map((alert) => (
            <div key={alert.id} className="rounded-lg border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
                <Badge variant={severityVariant[alert.severity] ?? "outline"} className="capitalize">{alert.severity}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Rule: {alert.code}</span>
                <span>Reference: <code>{alert.referenceId}</code></span>
                {alert.observed !== undefined && <span>Observed: {alert.code === "PRICE_DEVIATION" ? money(alert.observed) : alert.observed.toLocaleString()}</span>}
                {alert.expected !== undefined && <span>Expected/baseline: {alert.code === "PRICE_DEVIATION" ? money(alert.expected) : alert.expected.toLocaleString()}</span>}
                {alert.createdAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(alert.createdAt).toLocaleString()}</span>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Last generated: {new Date(data.generatedAt).toLocaleString()}. Alerts are indicators for authorized human review, not fraud findings, legal advice, or automatic enforcement. Current-rate VAT checks may flag older transactions if historical rule versions were not stored.
      </p>
    </div>
  );
}
