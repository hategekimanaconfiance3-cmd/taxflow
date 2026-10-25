"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { getQueueCount, processQueue } from "./queue";
import type { QueuedAction } from "./db";

// Re-export for convenience
export type { QueuedAction } from "./db";

/**
 * Hook to track online/offline status.
 */
function subscribeToOnlineStatus(onChange: () => void): () => void {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
    };
}

function getOnlineStatus(): boolean {
    return navigator.onLine;
}

function getServerOnlineStatus(): boolean {
    return true;
}

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getServerOnlineStatus);
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
    const autoSyncStartedRef = useRef(false);

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

    // IndexedDB is the source of truth; update React state when its async read resolves.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- This reads external IndexedDB state asynchronously.
        refreshCount();
    }, [refreshCount, isOnline]);

    // Auto-sync queued actions on reconnect or when the initial queue read completes.
    useEffect(() => {
        if (queueCount === 0) autoSyncStartedRef.current = false;
        if (!isOnline || queueCount === 0 || !executor || autoSyncStartedRef.current) return;
        autoSyncStartedRef.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Replaying queued external work is this effect's purpose.
        syncNow();
    }, [isOnline, queueCount, executor, syncNow]);

    useEffect(() => {
        if (!isOnline) {
            autoSyncStartedRef.current = false;
        }
    }, [isOnline]);

    return {
        isOnline,
        queueCount,
        syncStatus,
        lastResult,
        syncNow,
        refreshCount,
    };
}
