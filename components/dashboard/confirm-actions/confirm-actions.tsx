"use client";

import { useState, useTransition } from "react";
import {
    confirmTransaction,
    rejectTransaction,
} from "@/lib/actions/transaction.action";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";

interface ConfirmActionsProps {
    transactionId: string;
}

export function ConfirmActions({ transactionId }: ConfirmActionsProps) {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<"confirmed" | "rejected" | null>(null);
    const [error, setError] = useState("");

    function handleAction(action: "confirm" | "reject") {
        startTransition(async () => {
            try {
                setError("");
                if (action === "confirm") {
                    await confirmTransaction(transactionId);
                    setResult("confirmed");
                } else {
                    await rejectTransaction(transactionId);
                    setResult("rejected");
                }
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : `Failed to ${action}`,
                );
            }
        });
    }

    if (result) {
        return (
            <span
                className={`text-xs font-medium ${result === "confirmed"
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
            >
                {result === "confirmed" ? "✓ Order accepted" : "✕ Rejected"}
            </span>
        );
    }

    if (error) {
        return <span className="text-xs text-red-500">{error}</span>;
    }

    return (
        <div className="flex items-center gap-1">
            <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                onClick={() => handleAction("confirm")}
                disabled={isPending}
            >
                {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <Check className="h-3.5 w-3.5" />
                )}
                <span className="ml-1 text-xs">Accept order</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => handleAction("reject")}
                disabled={isPending}
            >
                <X className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
