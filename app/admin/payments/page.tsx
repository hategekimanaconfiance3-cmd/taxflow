import { requireRRASession } from "@/lib/auth-guard";
import { getPendingTaxPaymentsForReview } from "@/lib/actions/compliance.action";
import { PaymentReviewQueue } from "@/components/admin/payment-review-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default async function AdminPaymentReviewPage() {
  await requireRRASession("compliance_officer", "audit_officer");
  const payments = await getPendingTaxPaymentsForReview();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-muted/40">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax Payment Verification</h1>
          <p className="text-sm text-muted-foreground">Authorized RRA staff review queue</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Unverified submissions</CardTitle>
          <CardDescription>
            Submissions remain pending until an authorized officer checks independent settlement evidence. Verification and evidence references are recorded in the append-only audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentReviewQueue payments={payments} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        This screen is an internal TaxFlow review workflow, not a live RRA payment-provider integration. Officers must verify evidence through their authorized procedures before confirming settlement.
      </p>
    </div>
  );
}
