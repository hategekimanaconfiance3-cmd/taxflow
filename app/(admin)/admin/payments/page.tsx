import { requireRRASession } from "@/lib/auth-guard";
import { getAllPayments, getPaymentSummary } from "@/lib/actions/admin-payment.action";
import { PaymentReviewQueue, type PendingPaymentReviewItem } from "@/components/admin/payment-review-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banknote, ShieldCheck } from "lucide-react";

const money = (value: number) => `${Math.round(value).toLocaleString("en-RW")} RWF`;

export default async function AdminPaymentsPage() {
  const { staff } = await requireRRASession();
  const [payments, summary] = await Promise.all([
    getAllPayments("all"),
    getPaymentSummary(),
  ]);

  const pending = payments.filter((payment) => payment.status === "pending") as PendingPaymentReviewItem[];
  const canVerify = ["super_admin", "compliance_officer", "audit_officer"].includes(staff.clearanceLevel);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review submissions, verify settlement evidence, and inspect the payment history.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total payment records</CardDescription><CardTitle className="text-2xl">{summary.countAll}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Confirmed records</CardDescription><CardTitle className="text-2xl">{summary.countConfirmed}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{money(summary.totalCollected)} recorded as collected</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pending review</CardDescription><CardTitle className="text-2xl">{summary.countPending}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{money(summary.totalPending)} awaiting verification</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Rejected records</CardDescription><CardTitle className="text-2xl">{summary.countRejected}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Payment verification queue</CardTitle>
          <CardDescription>
            A payment stays pending until an authorized reviewer checks independent settlement evidence. Confirmation and evidence are written to the append-only audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canVerify ? (
            <PaymentReviewQueue payments={pending} />
          ) : (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              You can view payment records, but your current role cannot verify settlement. Contact an authorized compliance or audit officer.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" /> Recent payment records</CardTitle>
          <CardDescription>Latest 100 records returned by the payment service. Status changes require an authorized workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payment records found.</p>
          ) : payments.slice(0, 100).map((payment) => (
            <div key={payment.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{payment.businessName || payment.traderName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {payment.tinNumber || "No TIN"} · {payment.method.replace("_", " ")} · {new Date(payment.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Reference: {payment.reference || "Not supplied"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold">{money(payment.amount)}</span>
                <Badge variant={payment.status === "confirmed" ? "default" : payment.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{payment.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        This is a manual TaxFlow review process, not a live bank or payment-provider integration. Do not confirm a payment without independently verified evidence.
      </p>
    </div>
  );
}
