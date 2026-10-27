"use server";

import Redis from "ioredis";
import { and, eq, gt, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { notification, rraStaff, session, transaction } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

type Probe = { status: "healthy" | "unavailable" | "not_configured"; latencyMs?: number; detail: string };

async function probeValkey(): Promise<Probe> {
  const url = process.env.REDIS_URL;
  if (!url) return { status: "not_configured", detail: "REDIS_URL is not configured; realtime broker health cannot be checked." };
  const client = new Redis(url, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null });
  const started = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Health probe timed out")), 1800);
      }),
    ]);
    return { status: result === "PONG" ? "healthy" : "unavailable", latencyMs: Date.now() - started, detail: result === "PONG" ? "Valkey/Redis responded to PING. This does not verify Socket.IO delivery." : "Broker did not return the expected health response." };
  } catch (error) {
    return { status: "unavailable", latencyMs: Date.now() - started, detail: error instanceof Error && error.message === "Health probe timed out" ? "Broker health probe timed out." : "Broker connection failed." };
  } finally {
    if (timeout) clearTimeout(timeout);
    client.disconnect();
  }
}

export async function getSuperAdminPlatformHealth() {
  await requireRRASession("super_admin");
  const checkedAt = new Date();
  const dbStarted = Date.now();
  let database: Probe;
  try {
    await db.execute(sql`SELECT 1`);
    database = { status: "healthy", latencyMs: Date.now() - dbStarted, detail: "Database answered SELECT 1." };
  } catch (error) {
    console.error("Super Admin database health probe failed", { errorName: error instanceof Error ? error.name : typeof error });
    database = { status: "unavailable", latencyMs: Date.now() - dbStarted, detail: "Database health query failed." };
  }

  const [realtime, runtimeData] = await Promise.all([
    probeValkey(),
    Promise.allSettled([
      db.select({ latest: sql<Date | null>`MAX(${transaction.createdAt})` }).from(transaction),
      db.select({ latest: sql<Date | null>`MAX(${notification.createdAt})` }).from(notification),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(session)
        .innerJoin(rraStaff, eq(rraStaff.userId, session.userId))
        .where(and(eq(rraStaff.isActive, true), gt(session.expiresAt, checkedAt))),
    ]),
  ]);
  type LatestRow = { latest: Date | null };
  const transactionResult = runtimeData[0] as PromiseSettledResult<LatestRow[]>;
  const notificationResult = runtimeData[1] as PromiseSettledResult<LatestRow[]>;
  const lastOf = (result: PromiseSettledResult<LatestRow[]>): Date | null => result.status === "fulfilled" ? result.value[0]?.latest ?? null : null;
  const sessionRows = runtimeData[2];

  return {
    checkedAt: checkedAt.toISOString(),
    database,
    authentication: { status: "healthy" as const, detail: "The current request passed the server-side Super Admin session guard." },
    realtime,
    currentStaffSessions: sessionRows?.status === "fulfilled" ? Number(sessionRows.value[0]?.count ?? 0) : null,
    lastTransactionAt: lastOf(transactionResult)?.toISOString() ?? null,
    transactionTelemetryAvailable: transactionResult.status === "fulfilled",
    lastNotificationAt: lastOf(notificationResult)?.toISOString() ?? null,
    notificationTelemetryAvailable: notificationResult.status === "fulfilled",
    backgroundJobs: { status: "not_configured" as const, detail: "No background-job runner or job heartbeat table is configured." },
    integrations: { status: "not_configured" as const, detail: "No verified integration health registry is configured." },
  };
}
