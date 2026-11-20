// Server-only — LLM-Powered AI Insights Engine
// Uses Google Gemini Flash via @ai-sdk/google to generate natural language
// analysis of merchant risk scores, findings, and behavioral patterns.
// All LLM output is clearly labeled as AI-generated and requires human review.

import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { computeRiskScore } from './risk-scoring';
import { analyzeMerchantBehavior } from './behavioral-analysis';
import { getRevenueForecast } from './revenue-forecast';
import { getAuditRecommendations } from './smart-audit';
import db from '@/db/drizzle';
import { user, aiFinding } from '@/db/schema';
import { eq, sql, and, desc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMInsight {
  summary: string;           // 2–3 sentence plain-language summary
  keyFindings: string[];     // bullet points (3–5 items)
  recommendedActions: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  confidenceNote: string;    // mandatory disclaimer
  generatedAt: Date;
  modelUsed: string;
}

export interface LLMInsightResult {
  ok: boolean;
  insight?: LLMInsight;
  error?: string;
}

// ---------------------------------------------------------------------------
// Merchant Risk Insight — full natural-language analysis
// ---------------------------------------------------------------------------

export async function generateMerchantRiskInsight(
  merchantId: string,
): Promise<LLMInsightResult> {
  try {
    const [riskScore, behavior, merchantRow] = await Promise.all([
      computeRiskScore(merchantId),
      analyzeMerchantBehavior(merchantId),
      db.select({ businessName: user.businessName, tinNumber: user.tinNumber, role: user.role })
        .from(user).where(eq(user.id, merchantId)).limit(1),
    ]);

    const merchant = merchantRow[0];
    if (!merchant) return { ok: false, error: 'Merchant not found' };

    // Build a structured data payload for the LLM — no raw PII
    const dataPayload = JSON.stringify({
      merchant: {
        businessName: merchant.businessName ?? 'Unknown',
        tin: merchant.tinNumber ?? 'N/A',
        role: merchant.role,
      },
      riskScore: {
        score: riskScore.score,
        level: riskScore.level,
        status: riskScore.status,
        factors: riskScore.factors.map(f => ({
          signal: f.signal,
          value: f.value,
          weight: f.weight,
          status: f.status,
          description: f.description,
        })),
      },
      behavior: {
        patterns: behavior.patterns,
        underreportingRate: behavior.underreportingRate,
        priceConsistency: behavior.priceConsistency,
        riskTrend: behavior.riskTrend,
        totalTransactions: behavior.totalTransactions,
      },
    }, null, 2);

    const prompt = `You are TaxFlow Intelligence, an AI assistant for Rwanda Revenue Authority (RRA) tax officers.

Analyze the following structured merchant risk data and produce a concise, professional intelligence brief.

IMPORTANT RULES:
- Label all outputs as "AI-Generated Review Signal — Human Review Required"
- Never accuse the merchant of fraud or tax evasion — use "indicators" and "signals"
- Be precise, factual, and reference the specific signal values
- Recommend specific next steps an RRA officer should take
- Write in clear English suitable for a government officer

MERCHANT DATA:
${dataPayload}

Respond with ONLY valid JSON in this exact structure:
{
  "summary": "2-3 sentence plain language summary of the risk picture",
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "riskLevel": "low|medium|high|critical|unknown",
  "confidenceNote": "mandatory disclaimer about AI limitations"
}`;

    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt,
      maxOutputTokens: 1024,
      temperature: 0.1, // low temperature for consistent, factual output
    });

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM did not return valid JSON');

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      keyFindings: string[];
      recommendedActions: string[];
      riskLevel: LLMInsight['riskLevel'];
      confidenceNote: string;
    };

    return {
      ok: true,
      insight: {
        ...parsed,
        generatedAt: new Date(),
        modelUsed: 'gemini-1.5-flash',
      },
    };
  } catch (error) {
    console.error('[LLM Insights] generateMerchantRiskInsight error:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'LLM insight generation failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Revenue Gap Insight — explains what is driving the tax gap this period
// ---------------------------------------------------------------------------

export async function generateRevenueGapInsight(months = 6): Promise<LLMInsightResult> {
  try {
    const forecast = await getRevenueForecast(months);

    const dataPayload = JSON.stringify({
      period: forecast.period,
      expectedRevenue: forecast.expectedRevenue,
      actualRevenue: forecast.actualRevenue,
      gap: forecast.gap,
      gapPercentage: forecast.gapPercentage,
      trend: forecast.trend,
      confidence: forecast.confidence,
      projectedNextMonth: forecast.projectedNextMonth,
      gapCauses: forecast.gapCauses,
      topGapContributors: forecast.topGapContributors.slice(0, 5).map(c => ({
        merchantName: c.merchantName,
        gap: c.gap,
        gapPercentage: c.gapPercentage,
      })),
    }, null, 2);

    const prompt = `You are TaxFlow Intelligence, analyzing Rwanda Revenue Authority tax collection data.

Based on the revenue forecast data below, provide a strategic intelligence brief about the tax collection gap.

RULES:
- Be factual and reference specific numbers from the data (amounts in RWF)
- Identify patterns and systemic issues, not individual accusations
- Frame as "system-wide analysis" and note data limitations
- Recommend actionable enforcement and policy steps

REVENUE DATA (${months}-month period):
${dataPayload}

Respond with ONLY valid JSON:
{
  "summary": "2-3 sentence executive summary of the revenue situation",
  "keyFindings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "riskLevel": "low|medium|high|critical|unknown",
  "confidenceNote": "note about data quality and AI limitations"
}`;

    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt,
      maxOutputTokens: 1024,
      temperature: 0.1,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM did not return valid JSON');
    const parsed = JSON.parse(jsonMatch[0]) as Omit<LLMInsight, 'generatedAt' | 'modelUsed'>;

    return {
      ok: true,
      insight: {
        ...parsed,
        generatedAt: new Date(),
        modelUsed: 'gemini-1.5-flash',
      },
    };
  } catch (error) {
    console.error('[LLM Insights] generateRevenueGapInsight error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed' };
  }
}

// ---------------------------------------------------------------------------
// AI Finding Explanation — explain a specific aiFinding in plain language
// ---------------------------------------------------------------------------

export async function explainAIFinding(findingId: string): Promise<LLMInsightResult> {
  try {
    const [finding] = await db
      .select()
      .from(aiFinding)
      .where(eq(aiFinding.id, findingId))
      .limit(1);

    if (!finding) return { ok: false, error: 'Finding not found' };

    const [merchantRow] = finding.businessId
      ? await db
          .select({ businessName: user.businessName, tinNumber: user.tinNumber, role: user.role })
          .from(user)
          .where(eq(user.id, finding.businessId))
          .limit(1)
      : [undefined];

    const prompt = `You are TaxFlow Intelligence, explaining an AI-generated tax compliance finding to an RRA officer.

FINDING DETAILS:
- Type: ${finding.findingType}
- Severity: ${finding.severity}
- Business: ${merchantRow?.businessName ?? 'Unknown'} (${merchantRow?.tinNumber ?? 'N/A'})
- Role: ${merchantRow?.role ?? 'Unknown'}
- Observed Value: ${finding.observedValue ?? 'N/A'}
- Expected Value: ${finding.expectedValue ?? 'N/A'}
- Difference: ${finding.difference ?? 'N/A'} ${finding.differenceUnit ?? ''}
- System Explanation: ${finding.explanation}
- Review Status: ${finding.reviewStatus}
- Detection Method: ${finding.detectionMethod}

RULES:
- Explain what this finding means in plain English for a non-technical officer
- Explain WHY this triggers a review signal (what is the economic logic)
- List specific evidence the officer should gather to verify or dismiss
- Label as "AI-Generated Review Signal — Human Review Required"
- Never say this proves fraud or tax evasion

Respond with ONLY valid JSON:
{
  "summary": "plain English explanation of what this finding means",
  "keyFindings": ["what triggered this", "economic significance", "data quality note"],
  "recommendedActions": ["gather evidence 1", "verify step 2", "review workflow step 3"],
  "riskLevel": "low|medium|high|critical",
  "confidenceNote": "limitations of this AI finding"
}`;

    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt,
      maxOutputTokens: 1024,
      temperature: 0.1,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM did not return valid JSON');
    const parsed = JSON.parse(jsonMatch[0]) as Omit<LLMInsight, 'generatedAt' | 'modelUsed'>;

    return {
      ok: true,
      insight: {
        ...parsed,
        generatedAt: new Date(),
        modelUsed: 'gemini-1.5-flash',
      },
    };
  } catch (error) {
    console.error('[LLM Insights] explainAIFinding error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed' };
  }
}

// ---------------------------------------------------------------------------
// Audit Priority Brief — strategic overview for audit planning
// ---------------------------------------------------------------------------

export async function generateAuditPriorityBrief(): Promise<LLMInsightResult> {
  try {
    const auditPlan = await getAuditRecommendations(15);

    const dataPayload = JSON.stringify({
      totalMerchants: auditPlan.totalMerchants,
      estimatedRecovery: auditPlan.totalEstimatedRecovery,
      districtClusters: auditPlan.clusters.map(c => ({
        district: c.district,
        merchantCount: c.merchantCount,
        avgRiskScore: c.avgRiskScore,
        estimatedGap: c.totalEstimatedGap,
      })),
      topMerchants: auditPlan.clusters
        .flatMap(c => c.merchants)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5)
        .map(m => ({
          businessName: m.merchantName,
          district: m.district,
          riskLevel: m.riskLevel,
          priority: m.priority,
          estimatedGap: m.estimatedTaxGap,
          reasons: m.reasons.slice(0, 2),
        })),
    }, null, 2);

    const prompt = `You are TaxFlow Intelligence, preparing an audit priority brief for RRA leadership.

AUDIT PLAN DATA:
${dataPayload}

Write a strategic audit intelligence brief. Cover:
1. Overall scope and estimated tax recovery
2. Geographic patterns (which districts show highest risk concentration)
3. Top priority targets and why
4. Resource allocation recommendations

RULES:
- Write for RRA leadership, not technical staff
- Use specific numbers from the data (RWF amounts, counts)
- Label as AI recommendation requiring human validation
- Do not name individual merchants in the summary (use aggregate stats)

Respond with ONLY valid JSON:
{
  "summary": "2-3 sentence executive summary for RRA leadership",
  "keyFindings": ["geographic finding", "scope finding", "priority finding", "data quality finding"],
  "recommendedActions": ["action 1", "action 2", "action 3", "action 4"],
  "riskLevel": "low|medium|high|critical",
  "confidenceNote": "limitations of the AI audit recommendation"
}`;

    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt,
      maxOutputTokens: 1024,
      temperature: 0.1,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM did not return valid JSON');
    const parsed = JSON.parse(jsonMatch[0]) as Omit<LLMInsight, 'generatedAt' | 'modelUsed'>;

    return {
      ok: true,
      insight: {
        ...parsed,
        generatedAt: new Date(),
        modelUsed: 'gemini-1.5-flash',
      },
    };
  } catch (error) {
    console.error('[LLM Insights] generateAuditPriorityBrief error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed' };
  }
}

