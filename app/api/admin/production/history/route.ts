import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import db from "@/db/drizzle";
import { productionBatch, user } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { getProductionHistoryAnalysis } from "@/lib/ai/production-history-service";

const requestSchema = z.object({ batchId: z.string().trim().min(1).max(128) });

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    await requireRRAPermission("production.formula.read");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Enter a valid production batch reference." }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid production batch reference." }, { status: 400 });

    const [target] = await db.select({ batchReference: productionBatch.batchReference, tin: user.tinNumber })
      .from(productionBatch)
      .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
      .where(eq(productionBatch.id, parsed.data.batchId))
      .limit(1);
    if (!target?.tin) return NextResponse.json({ error: "Recipe-linked production evidence was not found." }, { status: 404 });

    const analysis = await getProductionHistoryAnalysis({
      tin: target.tin,
      batchReference: target.batchReference,
      lookbackDays: 90,
    });
    if (!analysis.found || analysis.batches.length === 0) {
      return NextResponse.json({ error: "Recipe-linked production evidence was not found." }, { status: 404 });
    }
    return NextResponse.json({ analysis, requestId }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    console.error("[production-history:read]", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    return NextResponse.json({ error: "Unable to retrieve authorized production history.", requestId }, { status: 500, headers: { "x-request-id": requestId } });
  }
}
