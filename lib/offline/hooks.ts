"use client";

import { useState, useEffect, useCallback } from "react";
import { getQueueCount, processQueue } from "./queue";
import type { QueuedAction } from "./db";

// Re-export for convenience
export type { QueuedAction } from "./db";

/**
 * Hook to track online/offline status.
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        // Set initial state
        setIsOnline(navigator.onLine);

        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    return isOnline;
}

type SyncStatus = "idle" | "syncing" | "synced" | "error";

/**
 * Hook to manage the sync queue.
 * Returns queue count, sync status, and a manual sync trigger.
 */
export function useSyncQueue(
    executor?: (
        action: QueuedAction["action"],
        payload: Record<string, unknown>,
    ) => Promise<void>,
) {
    const isOnline = useOnlineStatus();
    const [queueCount, setQueueCount] = useState(0);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [lastResult, setLastResult] = useState<{
        processed: number;
        failed: number;
    } | null>(null);

    // Refresh queue count
    const refreshCount = useCallback(async () => {
        try {
            const count = await getQueueCount();
            setQueueCount(count);
        } catch {
            // IndexedDB may not be available during SSR
        }
    }, []);

    // Sync now
    const syncNow = useCallback(async () => {
        if (!executor || !isOnline) return;
        setSyncStatus("syncing");
        try {
            const result = await processQueue(executor);
            setLastResult(result);
            setSyncStatus(result.failed > 0 ? "error" : "synced");
            await refreshCount();

            // Reset status after 3 seconds
            setTimeout(() => setSyncStatus("idle"), 3000);
        } catch {
            setSyncStatus("error");
        }
    }, [executor, isOnline, refreshCount]);

    // Refresh count on mount and when online status changes
    useEffect(() => {
        refreshCount();
    }, [refreshCount, isOnline]);

    // Auto-sync when coming back online
    useEffect(() => {
        if (isOnline && queueCount > 0 && executor) {
            syncNow();
        }
    }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        isOnline,
        queueCount,
        syncStatus,
        lastResult,
        syncNow,
        refreshCount,
    };
}
