"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { updatePaymentStatus } from "@/lib/actions/admin-payment.action";
import { verifyTaxPayment } from "@/lib/actions/compliance.action";

export function AdminPaymentActions({
  paymentId,
  reference,
}: {
  paymentId: string;
  reference?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [evidenceReference, setEvidenceReference] = useState(reference ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await verifyTaxPayment({ paymentId, evidenceReference });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Payment verification failed.");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      try {
        await updatePaymentStatus(paymentId, "rejected");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Payment review failed.");
      }
    });
  }

  return (
    <div className="flex min-w-56 flex-col items-end gap-2">
      <Input
        value={evidenceReference}
        onChange={(event) => setEvidenceReference(event.target.value)}
        placeholder="Evidence reference"
        aria-label="Verified payment evidence reference"
        minLength={5}
        maxLength={120}
        disabled={isPending}
        className="h-8 text-xs"
      />
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-emerald-700"
          disabled={isPending || evidenceReference.trim().length < 5}
          onClick={handleConfirm}
        >
          {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1 h-3.5 w-3.5" />}
          Verify
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-red-600"
          disabled={isPending}
          onClick={handleReject}
        >
          <XCircle className="mr-1 h-3.5 w-3.5" />
          Reject
        </Button>
      </div>
      {error && <p className="max-w-64 text-right text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
