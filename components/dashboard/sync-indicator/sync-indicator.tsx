"use client";

import { useSyncQueue } from "@/lib/offline/hooks";
import { Wifi, WifiOff, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";

interface SyncIndicatorProps {
    executor?: (
        action: string,
        payload: Record<string, unknown>,
    ) => Promise<void>;
}

/**
 * Sync status indicator for the topbar.
 * Shows online/offline status + pending sync count + manual sync button.
 * Displays a brief flash message on sync success or failure.
 */
export function SyncIndicator({ executor }: SyncIndicatorProps) {
    const { isOnline, queueCount, syncStatus, syncNow } =
        useSyncQueue(executor);

    const [flash, setFlash] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    const prevStatus = useRef(syncStatus);
    const prevCount = useRef(queueCount);

    // Show flash messages on sync transitions
    useEffect(() => {
        if (
            prevStatus.current === "syncing" &&
            syncStatus === "synced"
        ) {
            const synced = prevCount.current;
            setFlash({
                text: `${synced} item${synced !== 1 ? "s" : ""} synced`,
                type: "success",
            });
            const timer = setTimeout(() => setFlash(null), 3000);
            return () => clearTimeout(timer);
        }

        if (
            prevStatus.current === "syncing" &&
            syncStatus === "error"
        ) {
            setFlash({
                text: "Sync failed — will retry",
                type: "error",
            });
            const timer = setTimeout(() => setFlash(null), 4000);
            return () => clearTimeout(timer);
        }

        prevStatus.current = syncStatus;
        prevCount.current = queueCount;
    }, [syncStatus, queueCount]);

    // Nothing to show when online + no queue + no flash
    if (isOnline && queueCount === 0 && syncStatus === "idle" && !flash) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            {/* Flash message */}
            {flash && (
                <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full animate-in fade-in slide-in-from-right-2 ${flash.type === "success"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-red-500/10 text-red-600"
                        }`}
                >
                    {flash.text}
                </span>
            )}

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                            {/* Status icon */}
                            {!isOnline ? (
                                <WifiOff className="h-3.5 w-3.5 text-red-500" />
                            ) : syncStatus === "syncing" ? (
                                <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                            ) : syncStatus === "synced" ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : syncStatus === "error" ? (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                            )}

                            {/* Queue badge */}
                            {queueCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[10px] font-bold gap-1"
                                    onClick={() => syncNow()}
                                    disabled={
                                        !isOnline || syncStatus === "syncing"
                                    }
                                >
                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-white">
                                        {queueCount}
                                    </span>
                                    Sync
                                </Button>
                            )}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                        {!isOnline
                            ? `Offline — ${queueCount} action${queueCount !== 1 ? "s" : ""} queued`
                            : syncStatus === "syncing"
                                ? "Syncing..."
                                : syncStatus === "synced"
                                    ? "All synced!"
                                    : queueCount > 0
                                        ? `${queueCount} action${queueCount !== 1 ? "s" : ""} pending — click to sync`
                                        : "Online"}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
