import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRRAPermission } from "@/lib/auth-guard";
import { getPriceAlertDetail } from "@/lib/price-monitoring-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const money = (value: number) => `${value.toLocaleString()} RWF`;

export default async function PriceAlertDetailPage({ params }: { params: Promise<{ alertId: string }> }) {
  const { staff } = await requireRRAPermission("price.alert.read");
  const { alertId } = await params;
  const alert = await getPriceAlertDetail(staff, alertId);
  if (!alert) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/price-alerts" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Back to price alerts</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Price-change alert</h1>
          <Badge variant="outline" className="capitalize">{alert.status}</Badge>
          <Badge variant="outline" className="capitalize">{alert.severity}</Badge>
          <Badge variant="outline" className="capitalize">{alert.assignmentStatus}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">This record is evidence for authorized review, not an automatic finding of wrongdoing.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{alert.productName} · {alert.merchantName ?? "Unknown merchant"}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Merchant TIN</p><p className="font-medium">{alert.tinNumber ?? "Unavailable"}</p></div>
          <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{alert.merchantDistrict ?? "Unavailable"}, {alert.merchantProvince ?? "Unavailable"}</p></div>
          <div><p className="text-xs text-muted-foreground">Previous price</p><p className="font-medium">{money(alert.previousPrice)}</p></div>
          <div><p className="text-xs text-muted-foreground">New price</p><p className="font-medium">{money(alert.newPrice)}</p></div>
          <div><p className="text-xs text-muted-foreground">Difference</p><p className="font-medium">{alert.differenceRwf > 0 ? "+" : ""}{money(alert.differenceRwf)}</p></div>
          <div><p className="text-xs text-muted-foreground">Percentage change</p><p className="font-medium">{alert.percentageChange > 0 ? "+" : ""}{alert.percentageChange.toFixed(2)}%</p></div>
          <div><p className="text-xs text-muted-foreground">Recorded</p><p className="font-medium">{new Date(alert.createdAt).toLocaleString("en-GB")}</p></div>
          <div><p className="text-xs text-muted-foreground">Alert reason</p><p className="font-medium">{alert.alertReason ?? "Threshold exceeded"}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent merchant price history</CardTitle></CardHeader>
        <CardContent>
          {alert.recentHistory.length === 0 ? <p className="text-sm text-muted-foreground">No additional history is available in your scope.</p> : <div className="divide-y">{alert.recentHistory.map((item) => { const percentageChange = item.percentageChange ?? 0; return <div key={item.id} className="grid gap-2 py-3 text-sm sm:grid-cols-4"><span>{money(item.previousPrice ?? 0)} → {money(item.newPrice ?? 0)}</span><span>{percentageChange > 0 ? "+" : ""}{percentageChange.toFixed(2)}%</span><span>{item.reason ?? "No reason provided"}</span><span className="text-muted-foreground">{new Date(item.changedAt).toLocaleString("en-GB")}</span></div>; })}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Merchant explanations</CardTitle></CardHeader>
        <CardContent>
          {alert.explanations.length === 0 ? <p className="text-sm text-muted-foreground">No explanation has been submitted.</p> : <div className="space-y-4">{alert.explanations.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><p>{item.explanation}</p><p className="mt-2 text-xs text-muted-foreground">Submitted {new Date(item.createdAt).toLocaleString("en-GB")}{item.supportingDocumentUrl ? ` · ${item.supportingDocumentUrl}` : ""}</p></div>)}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
