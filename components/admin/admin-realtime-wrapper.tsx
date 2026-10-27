"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket-client";
import { AlertTriangle, CheckCircle, Info, X, Gavel, Ship } from "lucide-react";

interface FlashMessage {
    id: number;
    type: "info" | "success" | "warning";
    title: string;
    description: string;
}

let flashId = 0;

/**
 * Admin-side real-time wrapper.
 * Listens for events relevant to RRA and auto-refreshes + toasts.
 */
export function AdminRealtimeWrapper({
    userId,
    children,
}: {
    userId: string;
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [flashes, setFlashes] = useState<FlashMessage[]>([]);

    function flash(type: FlashMessage["type"], title: string, description: string) {
        const id = ++flashId;
        setFlashes((prev) => [...prev, { id, type, title, description }]);
        setTimeout(() => {
            setFlashes((p) => p.filter((f) => f.id !== id));
        }, 5000);
    }

    const refresh = useCallback(() => router.refresh(), [router]);

    useSocket(userId, {
        // Transaction events
        "txn:incoming": () => {
            flash("info", "New Transaction", "A new transaction has been created.");
            refresh();
        },
        "txn:confirmed": () => {
            flash("success", "Transaction Confirmed", "A buyer confirmed a purchase.");
            refresh();
        },
        "txn:rejected": () => {
            flash("warning", "Transaction Rejected", "A buyer rejected a transaction.");
            refresh();
        },
        // Import events
        "import:submitted": () => {
            flash("info", "Import Submitted", "A trader submitted import arrival details for review.");
            refresh();
        },
        "import:confirmed": () => {
            flash("success", "Import Confirmed", "Import was confirmed by RRA.");
            refresh();
        },
        "import:rejected": () => {
            flash("warning", "Import Rejected", "Import was rejected by RRA.");
            refresh();
        },
        // Dispute events
        "dispute:filed": () => {
            flash("warning", "Dispute Filed", "A new dispute was filed.");
            refresh();
        },
        "dispute:acknowledged": () => {
            flash("info", "Dispute Acknowledged", "Ready for RRA review.");
            refresh();
        },
        "dispute:contested": () => {
            flash("warning", "Dispute Contested", "Counterparty contested — ready for review.");
            refresh();
        },
        "dispute:resolved": () => {
            flash("success", "Dispute Resolved", "An RRA decision was issued.");
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
            {flashes.length > 0 && (
                <div className="fixed top-20 right-6 z-50 space-y-2 max-w-sm">
                    {flashes.map((f) => (
                        <div
                            key={f.id}
                            className={`flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right-5 ${bgMap[f.type]}`}
                        >
                            {iconMap[f.type]}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{f.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {f.description}
                                </p>
                            </div>
                            <button
                                onClick={() =>
                                    setFlashes((p) =>
                                        p.filter((x) => x.id !== f.id),
                                    )
                                }
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
