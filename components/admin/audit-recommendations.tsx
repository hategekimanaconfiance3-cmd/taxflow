"use client";

import { useEffect, useState } from "react";
import type { AuditPlan, AuditRecommendation } from "@/lib/ai/smart-audit";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import { ListCardSkeleton } from "@/components/admin/loading-skeletons";
import {
  Brain,
  Target,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// AI Audit Recommendations — upgraded with impact grouping, recovery, expandable
// ---------------------------------------------------------------------------

type ImpactTier = "high" | "medium" | "low";

interface ImpactGroup {
  tier: ImpactTier;
  label: string;
  description: string;
  merchants: AuditRecommendation[];
  totalEstimatedRecovery: number;
  icon: React.ReactNode;
  color: string;
  badgeColor: string;
  borderColor: string;
}

function getImpactTier(m: AuditRecommendation): ImpactTier {
  if (m.riskScore >= 70 || m.estimatedTaxGap > 500_000) return "high";
  if (m.riskScore >= 45 || m.estimatedTaxGap > 100_000) return "medium";
  return "low";
}

function getReasoning(reasons: string[]): string {
  if (reasons.length === 0) return "Potential review indicator based on multiple signals; verify the source records.";
  const r = reasons[0].toLowerCase();
  if (r.includes("vat") || r.includes("tax")) return `Potential tax-record discrepancy — ${reasons[0]}`;
  if (r.includes("stock") || r.includes("inventory")) return `Potential inventory signal — ${reasons[0]}`;
  if (r.includes("price") || r.includes("pricing")) return `Potential pricing variance — ${reasons[0]}`;
  if (r.includes("transaction") || r.includes("spike")) return `Transaction pattern for review — ${reasons[0]}`;
  if (r.includes("compliance") || r.includes("filing")) return `Compliance indicator for review — ${reasons[0]}`;
  return `Potential finding — ${reasons[0]}`;
}

export function AuditRecommendations() {
  const [plan, setPlan] = useState<AuditPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTiers, setExpandedTiers] = useState<Set<ImpactTier>>(new Set(["high"]));
  const [showAll, setShowAll] = useState<Set<ImpactTier>>(new Set());

  useEffect(() => {
    fetch("/api/ai/audit-recommendations?limit=20")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPlan(data))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <ListCardSkeleton rows={5} />;
  }

  if (!plan || plan.clusters.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Target className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
          <p className="text-sm font-medium">No review indicators surfaced</p>
          <p className="text-xs text-muted-foreground mt-1">This does not constitute a compliance decision or clearance.</p>
        </CardContent>
      </Card>
    );
  }

  // Flatten all merchants from all clusters
  const allMerchants = plan.clusters.flatMap(c => c.merchants);

  // Group by impact tier
  const groups: Record<ImpactTier, AuditRecommendation[]> = { high: [], medium: [], low: [] };
  for (const m of allMerchants) {
    groups[getImpactTier(m)].push(m);
  }

  const TIER_CONFIG: Record<ImpactTier, Omit<ImpactGroup, "merchants" | "totalEstimatedRecovery">> = {
    high: {
      tier: "high",
      label: "Higher Review Priority",
      description: "Indicator score ≥70 or estimated gap >500K RWF — verify evidence before deciding next steps",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      color: "text-red-600",
      badgeColor: "bg-red-100 text-red-700",
      borderColor: "border-red-200 bg-red-50/30",
    },
    medium: {
      tier: "medium",
      label: "Moderate Review Priority",
      description: "Indicator score 45–70 or estimated gap 100K–500K RWF — review supporting records",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      color: "text-amber-600",
      badgeColor: "bg-amber-100 text-amber-700",
      borderColor: "border-amber-200 bg-amber-50/20",
    },
    low: {
      tier: "low",
      label: "Routine Review Signal",
      description: "Signals below the higher-priority range — officer judgment is required",
      icon: <Info className="h-3.5 w-3.5" />,
      color: "text-blue-600",
      badgeColor: "bg-blue-100 text-blue-700",
      borderColor: "border-blue-100",
    },
  };

  const impactGroups: ImpactGroup[] = (["high", "medium", "low"] as ImpactTier[])
    .filter(tier => groups[tier].length > 0)
    .map(tier => ({
      ...TIER_CONFIG[tier],
      merchants: groups[tier].sort((a, b) => b.riskScore - a.riskScore),
      totalEstimatedRecovery: groups[tier].reduce((s, m) => s + m.estimatedTaxGap, 0),
    }));

  const toggleTier = (tier: ImpactTier) => setExpandedTiers(prev => {
    const n = new Set(prev);
    if (n.has(tier)) n.delete(tier);
    else n.add(tier);
    return n;
  });

  const toggleShowAll = (tier: ImpactTier, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAll(prev => {
      const n = new Set(prev);
      if (n.has(tier)) n.delete(tier);
      else n.add(tier);
      return n;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            AI Findings — Requires Human Review
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {plan.totalMerchants} records to review
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <TrendingUp className="h-3 w-3" />
              {formatCompact(plan.totalEstimatedRecovery)} unverified estimated gap
            </span>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          {impactGroups.map(g => (
            <div key={g.tier} className={`rounded-lg border ${g.borderColor} px-2.5 py-2 text-center`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${g.color}`}>{g.label}</p>
              <p className="text-sm font-bold mt-0.5">{g.merchants.length}</p>
              {g.totalEstimatedRecovery > 0 && (
                <p className={`text-[9px] font-mono ${g.color}`}>{formatCompact(g.totalEstimatedRecovery)} gap</p>
              )}
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5">
        {/* Batch action for high-impact */}
        {groups.high.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/40 px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-red-700">
                {groups.high.length} record{groups.high.length !== 1 ? "s" : ""} have indicators for human review
              </p>
              <p className="text-[10px] text-muted-foreground">
                Unverified estimated gap: {formatCompact(groups.high.reduce((s, m) => s + m.estimatedTaxGap, 0))} RWF
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-[11px] px-3 bg-red-600 hover:bg-red-700 shrink-0"
              onClick={() => window.open("/admin/traders", "_blank")}
            >
              <Zap className="h-3 w-3 mr-1" />
              Review Evidence
            </Button>
          </div>
        )}

        {/* Tier groups */}
        {impactGroups.map(group => {
          const isExpanded = expandedTiers.has(group.tier);
          const isShowingAll = showAll.has(group.tier);
          const visibleMerchants = isShowingAll ? group.merchants : group.merchants.slice(0, 5);

          return (
            <div key={group.tier} className={`rounded-lg border overflow-hidden ${group.borderColor}`}>
              {/* Tier header */}
              <button
                onClick={() => toggleTier(group.tier)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-black/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={group.color}>{group.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${group.color}`}>{group.label}</span>
                      <Badge variant="secondary" className={`text-[9px] ${group.badgeColor}`}>
                        {group.merchants.length} merchants
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{group.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {group.totalEstimatedRecovery > 0 && (
                    <span className={`text-[10px] font-mono font-semibold ${group.color}`}>
                      {formatCompact(group.totalEstimatedRecovery)} RWF
                    </span>
                  )}
                  {isExpanded
                    ? <ChevronUp className={`h-3.5 w-3.5 ${group.color}`} />
                    : <ChevronDown className={`h-3.5 w-3.5 ${group.color}`} />
                  }
                </div>
              </button>

              {/* Merchant list */}
              {isExpanded && (
                <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
                  {visibleMerchants.map((m) => (
                    <div
                      key={m.merchantId}
                      className="flex items-start gap-3 rounded-md border bg-background px-2.5 py-2 text-xs"
                    >
                      <RiskScoreBadge score={m.riskScore} level={m.riskLevel} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{m.merchantName ?? "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{getReasoning(m.reasons)}</p>
                        {m.tinNumber && (
                          <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">TIN: {m.tinNumber}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {m.estimatedTaxGap > 0 ? (
                          <>
                            <p className="font-mono text-red-600 font-semibold">-{formatCompact(m.estimatedTaxGap)}</p>
                      <p className="text-[9px] text-muted-foreground">unverified estimate</p>
                          </>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground/30 mt-1" />
                        )}
                      </div>
                    </div>
                  ))}

                  {group.merchants.length > 5 && (
                    <button
                      onClick={(e) => toggleShowAll(group.tier, e)}
                      className={`w-full text-[10px] font-medium py-1.5 rounded border transition-colors ${group.color} hover:bg-black/5`}
                    >
                      {isShowingAll
                        ? "Show fewer"
                        : `Show ${group.merchants.length - 5} more merchants`
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
