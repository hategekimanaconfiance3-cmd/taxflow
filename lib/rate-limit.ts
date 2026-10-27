import { createHash } from "node:crypto";
import { lte, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { rateLimit } from "@/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Atomic, database-backed fixed-window limit shared by all app instances. */
export async function consumeRateLimit(
  namespace: string,
  identity: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new TypeError("Rate limit configuration must use positive integers.");
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Rate limiting requires BETTER_AUTH_SECRET.");

  const now = Date.now();
  const cutoff = now - windowSeconds * 1_000;
  const key = `${namespace}:${createHash("sha256").update(`${secret}:${identity}`).digest("hex")}`;
  const [result] = await db
    .insert(rateLimit)
    .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${rateLimit.lastRequest} <= ${cutoff} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} <= ${cutoff} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

  // Reclaim dormant identities occasionally so this shared table stays bounded.
  if (Math.random() < 0.01) {
    await db.delete(rateLimit).where(lte(rateLimit.lastRequest, now - 24 * 60 * 60 * 1_000));
  }

  if (!result) throw new Error("Rate limit update returned no state.");
  const allowed = result.count <= maxRequests;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((result.lastRequest + windowSeconds * 1_000 - now) / 1_000)),
  };
}

export function getRequestIdentity(headers: Pick<Headers, "get">): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const address = forwardedFor?.split(",", 1)[0]?.trim();
  return address || "unknown-client";
}
