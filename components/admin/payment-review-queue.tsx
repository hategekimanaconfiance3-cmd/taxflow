"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { verifyTaxPayment } from "@/lib/actions/compliance.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

export interface PendingPaymentReviewItem {
  id: string;
  businessId: string;
  businessName: string | null;
  traderName: string;
  tinNumber: string | null;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  createdAt: Date | string;
}

export function PaymentReviewQueue({ payments }: { payments: PendingPaymentReviewItem[] }) {
  const router = useRouter();
  const [evidence, setEvidence] = useState<Record<string, string>>(
    () => Object.fromEntries(payments.map((payment) => [payment.id, payment.reference ?? ""])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; kind: "success" | "error"; text: string } | null>(null);

  async function submitVerification(event: FormEvent<HTMLFormElement>, payment: PendingPaymentReviewItem) {
    event.preventDefault();
    if (busyId) return;
    setBusyId(payment.id);
    setMessage(null);
    try {
      await verifyTaxPayment({
        paymentId: payment.id,
        evidenceReference: evidence[payment.id] ?? "",
      });
      setMessage({ id: payment.id, kind: "success", text: "Payment verified and audit record created." });
      router.refresh();
    } catch (error) {
      setMessage({
        id: payment.id,
        kind: "error",
        text: error instanceof Error ? error.message : "Payment verification failed.",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="mt-3 font-medium">No pending payment submissions</p>
        <p className="mt-1 text-sm text-muted-foreground">New submissions will appear here until an authorized officer verifies them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => (
        <article key={payment.id} className="rounded-xl border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{payment.businessName || payment.traderName}</h2>
                <Badge variant="outline">Pending verification</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {payment.tinNumber ? `TIN ${payment.tinNumber} · ` : ""}{payment.traderName}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{payment.amount.toLocaleString("en-RW")} RWF</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Method: {payment.method.replace("_", " ")} · Submitted {new Date(payment.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Submission reference: {payment.reference || "Not provided"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:max-w-56">
              Verify the payment against independent provider, bank, or official cash-receipt evidence before confirming it.
            </div>
          </div>

          <form onSubmit={(event) => submitVerification(event, payment)} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={evidence[payment.id] ?? ""}
              onChange={(event) => setEvidence((current) => ({ ...current, [payment.id]: event.target.value }))}
              placeholder="Verified provider / receipt reference"
              minLength={5}
              maxLength={120}
              required
              aria-label={`Evidence reference for payment ${payment.id}`}
              disabled={busyId !== null}
            />
            <Button type="submit" disabled={busyId !== null} className="shrink-0">
              {busyId === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Verify settlement
            </Button>
          </form>
          {message?.id === payment.id && (
            <p className={`mt-2 text-sm ${message.kind === "success" ? "text-emerald-600" : "text-destructive"}`} role="status">
              {message.text}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
