"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { getQueueCount, processQueue } from "./queue";
import type { QueuedAction } from "./db";

// Re-export for convenience
export type { QueuedAction } from "./db";

/**
 * Hook to track online/offline status.
 */
function subscribeToOnlineStatus(onChange: () => void) {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
    };
}

function getOnlineSnapshot() {
    return navigator.onLine;
}

export function useOnlineStatus() {
    return useSyncExternalStore(subscribeToOnlineStatus, getOnlineSnapshot, () => true);
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
        const timer = window.setTimeout(() => void refreshCount(), 0);
        return () => window.clearTimeout(timer);
    }, [refreshCount, isOnline]);

    // Auto-sync when coming back online
    useEffect(() => {
        if (isOnline && queueCount > 0 && executor) {
            window.setTimeout(() => void syncNow(), 0);
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
