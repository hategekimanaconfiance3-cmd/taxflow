import { requireRRASession } from "@/lib/auth-guard";
import db from "@/db/drizzle";
import { notification } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const { user } = await requireRRASession();
        const [result] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(notification)
            .where(
                and(
                    eq(notification.userId, user.id),
                    eq(notification.read, false),
                ),
            );
        return NextResponse.json({ count: result?.count ?? 0 });
    } catch {
        return NextResponse.json({ count: 0 });
    }
}
