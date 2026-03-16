"use server";

import { eq, sql, ilike } from "drizzle-orm";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

/**
 * Search traders by TIN or business name. Returns up to 8 results.
 */
export async function searchTraders(query: string) {
    await requireRRASession();

    if (!query || query.trim().length < 2) return [];

    const q = query.trim();

    const results = await db
        .select({
            id: user.id,
            name: user.name,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
        })
        .from(user)
        .where(
            sql`(${user.role} IN ('manufacturer', 'wholesaler', 'retailer'))
                AND (
                    ${user.tinNumber} ILIKE ${"%" + q + "%"}
                    OR ${user.businessName} ILIKE ${"%" + q + "%"}
                    OR ${user.name} ILIKE ${"%" + q + "%"}
                )`,
        )
        .limit(8);

    return results;
}
