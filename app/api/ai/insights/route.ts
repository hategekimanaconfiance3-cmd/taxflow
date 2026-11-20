// POST /api/ai/insights
// Generate LLM-powered natural language insights about merchants, revenue, or findings.
// Requires active RRA staff session.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import db from '@/db/drizzle';
import { rraStaff, rraStaffRole } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { isRRARole } from '@/lib/rra-rbac';
import {
  generateMerchantRiskInsight,
  generateRevenueGapInsight,
  explainAIFinding,
  generateAuditPriorityBrief,
} from '@/lib/ai/llm-insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('merchant_risk'), merchantId: z.string().uuid() }),
  z.object({ type: z.literal('revenue_gap'), months: z.number().int().min(1).max(12).default(6) }),
  z.object({ type: z.literal('finding_explanation'), findingId: z.string().uuid() }),
  z.object({ type: z.literal('audit_brief') }),
]);

async function requireRRAStaff() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const [staff] = await db.select({ id: rraStaff.id })
    .from(rraStaff)
    .where(and(eq(rraStaff.userId, session.user.id), eq(rraStaff.isActive, true)))
    .limit(1);
  return staff ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireRRAStaff();
    if (!staff) {
      return NextResponse.json({ ok: false, error: 'RRA staff session required' }, { status: 401 });
    }

    const body = await request.json() as unknown;
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const req = parsed.data;
    let result;

    switch (req.type) {
      case 'merchant_risk':
        result = await generateMerchantRiskInsight(req.merchantId);
        break;
      case 'revenue_gap':
        result = await generateRevenueGapInsight(req.months);
        break;
      case 'finding_explanation':
        result = await explainAIFinding(req.findingId);
        break;
      case 'audit_brief':
        result = await generateAuditPriorityBrief();
        break;
    }

    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[/api/ai/insights] error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
