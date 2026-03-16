"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket-client";
import { useSocketContext } from "@/components/providers/socket-provider";
import { AlertTriangle, CheckCircle, Info, X } from "lucide-react";

interface FlashMessage {
    id: number;
    type: "info" | "success" | "warning";
    title: string;
    description: string;
}

let flashCounter = 0;

/**
 * Client wrapper that subscribes to all dispute-related real-time events
 * and auto-refreshes the page + shows flash notifications.
 */
export function DisputeRealtimeWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { userId } = useSocketContext();
    const [flashes, setFlashes] = useState<FlashMessage[]>([]);

    function showFlash(type: FlashMessage["type"], title: string, description: string) {
        const id = ++flashCounter;
        setFlashes((prev) => [...prev, { id, type, title, description }]);
        setTimeout(() => {
            setFlashes((prev) => prev.filter((f) => f.id !== id));
        }, 5000);
    }

    function dismissFlash(id: number) {
        setFlashes((prev) => prev.filter((f) => f.id !== id));
    }

    const refresh = useCallback(() => {
        router.refresh();
    }, [router]);

    useSocket(userId, {
        "dispute:filed": (data: unknown) => {
            const d = data as { referenceNumber?: string };
            showFlash(
                "warning",
                "New Dispute Filed",
                `Dispute ${d.referenceNumber || ""} requires your response.`,
            );
            refresh();
        },
        "dispute:acknowledged": (data: unknown) => {
            const d = data as { referenceNumber?: string };
            showFlash(
                "success",
                "Dispute Acknowledged",
                `${d.referenceNumber || "Dispute"} acknowledged. Escalated to RRA.`,
            );
            refresh();
        },
        "dispute:contested": (data: unknown) => {
            const d = data as { referenceNumber?: string };
            showFlash(
                "warning",
                "Dispute Contested",
                `${d.referenceNumber || "Dispute"} contested by counterparty. Escalated to RRA.`,
            );
            refresh();
        },
        "dispute:resolved": (data: unknown) => {
            const d = data as { referenceNumber?: string; action?: string };
            const actionLabel: Record<string, string> = {
                undo_transaction: "Transaction Undone",
                adjust_amount: "Amount Adjusted",
                uphold_dispute: "Dispute Upheld",
                dismiss: "Dismissed",
            };
            showFlash(
                "info",
                "RRA Decision Issued",
                `${d.referenceNumber || "Dispute"}: ${actionLabel[d.action || ""] || "Resolved"}`,
            );
            refresh();
        },
    });

    const iconMap = {
        info: <Info className="h-4 w-4 text-blue-500 shrink-0" />,
        success: <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
    };

    const bgMap = {
        info: "bg-blue-50 border-blue-200",
        success: "bg-emerald-50 border-emerald-200",
        warning: "bg-amber-50 border-amber-200",
    };

    return (
        <>
            {/* Flash notifications */}
            {flashes.length > 0 && (
                <div className="fixed top-20 right-6 z-50 space-y-2 max-w-sm">
                    {flashes.map((flash) => (
                        <div
                            key={flash.id}
                            className={`flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right-5 ${bgMap[flash.type]}`}
                        >
                            {iconMap[flash.type]}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">
                                    {flash.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {flash.description}
                                </p>
                            </div>
                            <button
                                onClick={() => dismissFlash(flash.id)}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {children}
        </>
    );
}
