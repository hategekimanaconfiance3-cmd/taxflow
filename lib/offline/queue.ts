import { getOfflineDB, type QueuedAction } from "./db";

/**
 * Add an action to the sync queue (called when offline).
 */
export async function enqueueAction(
    action: QueuedAction["action"],
    payload: Record<string, unknown>,
): Promise<string> {
    const db = await getOfflineDB();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: QueuedAction = {
        id,
        action,
        payload,
        createdAt: Date.now(),
        retries: 0,
    };
    await db.put("syncQueue", entry);
    return id;
}

/**
 * Get all queued actions, oldest first.
 */
export async function getQueuedActions(): Promise<QueuedAction[]> {
    const db = await getOfflineDB();
    return db.getAllFromIndex("syncQueue", "by-created");
}

/**
 * Remove a successfully processed action from the queue.
 */
export async function removeFromQueue(id: string): Promise<void> {
    const db = await getOfflineDB();
    await db.delete("syncQueue", id);
}

/**
 * Mark an action as failed (increment retries, store error).
 */
export async function markFailed(
    id: string,
    error: string,
): Promise<void> {
    const db = await getOfflineDB();
    const entry = await db.get("syncQueue", id);
    if (!entry) return;
    entry.retries += 1;
    entry.error = error;
    await db.put("syncQueue", entry);
}

/**
 * Get count of pending items in the queue.
 */
export async function getQueueCount(): Promise<number> {
    const db = await getOfflineDB();
    return db.count("syncQueue");
}

/**
 * Process all queued actions sequentially.
 * Returns { processed, failed } counts.
 */
export async function processQueue(
    executor: (action: QueuedAction["action"], payload: Record<string, unknown>) => Promise<void>,
): Promise<{ processed: number; failed: number }> {
    const actions = await getQueuedActions();
    let processed = 0;
    let failed = 0;

    for (const action of actions) {
        try {
            await executor(action.action, action.payload);
            await removeFromQueue(action.id);
            processed++;
        } catch (err) {
            const errorMsg =
                err instanceof Error ? err.message : "Unknown error";
            await markFailed(action.id, errorMsg);
            failed++;
        }
    }

    return { processed, failed };
}
