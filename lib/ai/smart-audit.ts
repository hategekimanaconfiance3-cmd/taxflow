// Server-only — AI Smart Audit Selection Engine

import { sql, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import tinDb from "@/db/tin-drizzle";
import { tinRecord } from "@/db/tin-schema";
import { computeAllRiskScores, type RiskScore } from "@/lib/ai/risk-scoring";
import { getRevenueForecast } from "@/lib/ai/revenue-forecast";

// ---------------------------------------------------------------------------
// AI Smart Audit Selection Engine
// Recommends which merchants to audit, grouped by district for efficiency.
// From research: Roles_Digital_Tax_System.pdf → Role #4 "Smart Audit"
// ---------------------------------------------------------------------------

export interface AuditRecommendation {
    merchantId: string;
    merchantName: string | null;
    tinNumber: string | null;
    district: string | null;
    riskScore: number;
    riskLevel: RiskScore["level"];
    estimatedTaxGap: number;
    priority: number;            // 1–100 composite priority
    reasons: string[];
}

export interface AuditCluster {
    district: string;
    merchants: AuditRecommendation[];
    totalEstimatedGap: number;
    avgRiskScore: number;
    merchantCount: number;
}

export interface AuditPlan {
    clusters: AuditCluster[];
    totalMerchants: number;
    totalEstimatedRecovery: number;
    computedAt: Date;
}

/**
 * Generate AI-driven audit recommendations.
 * Takes top risk-scored merchants, groups by district, and ranks by composite priority.
 */
export async function getAuditRecommendations(
    topN: number = 20,
): Promise<AuditPlan> {
    // 1. Get all risk scores (sorted highest first)
    const riskScores = await computeAllRiskScores();

    // 2. Filter to actionable risk levels (medium+)
    const actionable = riskScores.filter(
        (s) => s.level === "critical" || s.level === "high" || s.level === "medium",
    ).slice(0, topN);

    if (actionable.length === 0) {
        return {
            clusters: [],
            totalMerchants: 0,
            totalEstimatedRecovery: 0,
            computedAt: new Date(),
        };
    }

    // 3. Get gap contributors for estimated tax recovery
    const forecast = await getRevenueForecast(6);
    const gapMap = new Map(
        forecast.topGapContributors.map((g) => [g.merchantId, g.gap]),
    );

    // 4. Enrich with TIN and district
    const merchantIds = actionable.map((s) => s.merchantId);
    const merchants = await db
        .select({
            id: user.id,
            tinNumber: user.tinNumber,
            businessName: user.businessName,
        })
        .from(user)
        .where(sql`${user.id} IN (${sql.join(merchantIds.map(id => sql`${id}`), sql`, `)})`);

    const merchantMap = new Map(merchants.map((m) => [m.id, m]));

    // Get districts from TIN DB
    const tinNumbers = merchants
        .map((m) => m.tinNumber)
        .filter((t): t is string => t !== null);

    const tinDistricts = tinNumbers.length > 0
        ? await tinDb
            .select({ tinNumber: tinRecord.tinNumber, district: tinRecord.district })
            .from(tinRecord)
            .where(inArray(tinRecord.tinNumber, tinNumbers))
        : [];

    const districtMap = new Map(tinDistricts.map((t) => [t.tinNumber, t.district]));

    // 5. Build recommendations
    const recommendations: AuditRecommendation[] = actionable.map((score) => {
        const merchant = merchantMap.get(score.merchantId);
        const tinNum = merchant?.tinNumber ?? null;
        const district = tinNum ? (districtMap.get(tinNum) ?? null) : null;
        const taxGap = gapMap.get(score.merchantId) ?? 0;

        // Composite priority: risk score (60%) + tax gap presence (30%) + recency (10%)
        const gapFactor = taxGap > 0 ? Math.min(30, Math.round((taxGap / 1_000_000) * 10)) : 0;
        const priority = Math.min(100, Math.round(score.score * 0.6 + gapFactor + 10));

        const reasons: string[] = [];
        for (const f of score.factors) {
            if (f.value >= 25) {
                reasons.push(`${f.signal}: ${f.description}`);
            }
        }
        if (taxGap > 0) {
            reasons.push(`Outstanding tax: ${taxGap.toLocaleString()} RWF`);
        }

        return {
            merchantId: score.merchantId,
            merchantName: score.merchantName,
            tinNumber: tinNum,
            district,
            riskScore: score.score,
            riskLevel: score.level,
            estimatedTaxGap: taxGap,
            priority,
            reasons,
        };
    });

    // Sort by priority (highest first)
    recommendations.sort((a, b) => b.priority - a.priority);

    // 6. Group by district for geo-efficient auditing
    const clusterMap = new Map<string, AuditRecommendation[]>();
    for (const rec of recommendations) {
        const key = rec.district ?? "Unknown";
        const list = clusterMap.get(key) ?? [];
        list.push(rec);
        clusterMap.set(key, list);
    }

    const clusters: AuditCluster[] = Array.from(clusterMap.entries())
        .map(([district, merchants]) => ({
            district,
            merchants,
            totalEstimatedGap: merchants.reduce((s, m) => s + m.estimatedTaxGap, 0),
            avgRiskScore: Math.round(
                merchants.reduce((s, m) => s + m.riskScore, 0) / merchants.length,
            ),
            merchantCount: merchants.length,
        }))
        .sort((a, b) => b.totalEstimatedGap - a.totalEstimatedGap || b.avgRiskScore - a.avgRiskScore);

    return {
        clusters,
        totalMerchants: recommendations.length,
        totalEstimatedRecovery: recommendations.reduce((s, r) => s + r.estimatedTaxGap, 0),
        computedAt: new Date(),
    };
}
