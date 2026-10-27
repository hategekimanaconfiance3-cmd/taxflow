import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "taxflow-offline";
const DB_VERSION = 1;

export interface QueuedAction {
    id: string;
    action:
    | "createTransaction"
    | "createRetailSale"
    | "addProduction"
    | "confirmTransaction"
    | "rejectTransaction"
    | "declareImport"
    | "confirmImportArrival"
    | "submitImportArrival";
    payload: Record<string, unknown>;
    createdAt: number;
    retries: number;
    error?: string;
}

export interface CachedStock {
    productId: string;
    productName: string;
    quantity: number;
    updatedAt: number;
}

/**
 * Open the TaxFlow offline database.
 * Stores: syncQueue (queued offline actions), cachedStock (local stock cache)
 */
export async function getOfflineDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // Sync queue — actions to replay when back online
            if (!db.objectStoreNames.contains("syncQueue")) {
                const store = db.createObjectStore("syncQueue", {
                    keyPath: "id",
                });
                store.createIndex("by-created", "createdAt");
            }

            // Cached stock — local copy for offline visibility
            if (!db.objectStoreNames.contains("cachedStock")) {
                db.createObjectStore("cachedStock", {
                    keyPath: "productId",
                });
            }
        },
    });
}
