"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { updatePaymentStatus } from "@/lib/actions/admin-payment.action";

export function AdminPaymentActions({ paymentId }: { paymentId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleAction(status: "confirmed" | "rejected") {
        startTransition(async () => {
            await updatePaymentStatus(paymentId, status);
            router.refresh();
        });
    }

    return (
        <div className="flex items-center gap-1 justify-end">
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                disabled={isPending}
                onClick={() => handleAction("confirmed")}
            >
                {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <CheckCircle className="h-3.5 w-3.5" />
                )}
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                disabled={isPending}
                onClick={() => handleAction("rejected")}
            >
                <XCircle className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
