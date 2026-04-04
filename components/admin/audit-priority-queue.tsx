"use client";

import { useEffect, useState } from "react";
import type { RiskHeatmapData } from "@/lib/actions/risk-heatmap.action";
import type { SmartAlertsData } from "@/lib/actions/smart-alerts.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import { Loader2, Target, AlertTriangle, CheckCircle2, FileSearch, ChevronDown, ChevronUp, Users, MapPin } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Audit Priority Queue — upgraded with filters, action buttons, AI reasoning
// ---------------------------------------------------------------------------

interface AuditTrader {
  id: string;
  name: string;
  score: number;
  level: "critical" | "high" | "medium" | "low";
  topReason: string;
  aiReasoning: string;
  hasAlerts: boolean;
  alertTypes: string[];
  sector: string;
  suggestedAction: string;
  isNew: boolean;
}

type FilterMode = "all" | "critical" | "high" | "anomaly";

const SECTOR_LABELS: Record<string, string> = {
  manufacturer: "Manufacturing",
  wholesaler: "Wholesale",
  retailer: "Retail",
};

function buildAIReasoning(trader: Pick<AuditTrader, "score" | "level" | "topReason" | "hasAlerts" | "alertTypes">): string {
  const r = trader.topReason.toLowerCase();
  const parts: string[] = [];

  if (trader.score >= 75) parts.push(`Risk score of ${trader.score}/100 places this trader in the critical tier.`);
  else if (trader.score >= 50) parts.push(`Risk score of ${trader.score}/100 indicates elevated risk requiring review.`);

  if (r.includes("vat") || r.includes("tax")) parts.push("VAT mismatch detected between reported sales and filed amounts.");
  if (r.includes("stock") || r.includes("inventory")) parts.push("Stock reconciliation anomaly — reported inventory inconsistent with purchase records.");
  if (r.includes("pricing") || r.includes("price")) parts.push("Pricing patterns deviate significantly from sector baseline.");
  if (r.includes("suspicious") || r.includes("flag")) parts.push("Multiple suspicious activity markers logged in the audit trail.");
  if (r.includes("compliance") || r.includes("filing")) parts.push("Filing history shows irregular compliance behaviour.");
  if (r.includes("payment") || r.includes("unpaid")) parts.push("Outstanding VAT obligations remain unresolved.");
  if (trader.hasAlerts) parts.push(`Active system alert${trader.alertTypes.length > 1 ? "s" : ""}: ${trader.alertTypes.join(", ")}.`);

  if (parts.length === 0) parts.push(trader.topReason);
  return parts.slice(0, 2).join(" ");
}

function deriveSuggestedAction(level: AuditTrader["level"], reason: string, hasAlerts: boolean): string {
  const r = reason.toLowerCase();
  if (r.includes("pricing")) return "Review pricing anomalies vs sector baseline";
  if (r.includes("vat") || r.includes("tax")) return "Cross-check VAT filings vs reported sales";
  if (r.includes("stock") || r.includes("inventory")) return "Verify stock levels against purchase records";
  if (r.includes("payment") || r.includes("unpaid")) return "Issue formal payment demand notice";
  if (hasAlerts && level === "critical") return "Initiate field audit immediately";
  if (level === "critical") return "Initiate field audit — critical risk score";
  if (level === "high") return "Schedule desk audit within 7 days";
  if (level === "medium") return "Monitor transactions for next 30 days";
  return "Flag for routine quarterly review";
}

export function AuditPriorityQueue() {
  const [riskData, setRiskData] = useState<RiskHeatmapData | null>(null);
  const [alertData, setAlertData] = useState<SmartAlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [groupBySector, setGroupBySector] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/risk-heatmap").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/smart-alerts").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([risk, alerts]) => { setRiskData(risk); setAlertData(alerts); })
      .catch(() => { setRiskData(null); setAlertData(null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Building audit priority queue…</span>
        </CardContent>
      </Card>
    );
  }

  const allTraders = buildPriorityList(riskData, alertData);

  if (allTraders.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Target className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
          <p className="text-sm font-medium">No audit priorities</p>
          <p className="text-xs text-muted-foreground mt-1">All traders within acceptable risk levels.</p>
        </CardContent>
      </Card>
    );
  }

  const filteredTraders = allTraders.filter((t) => {
    if (reviewed.has(t.id)) return false;
    if (filter === "critical") return t.level === "critical";
    if (filter === "high") return t.level === "high" || t.level === "critical";
    if (filter === "anomaly") return t.hasAlerts || t.isNew;
    return true;
  });

  const flaggedCount = allTraders.filter(t => t.level === "critical" || t.level === "high" || t.hasAlerts).length;
  const criticalCount = allTraders.filter(t => t.level === "critical").length;
  const anomalyCount = allTraders.filter(t => t.hasAlerts || t.isNew).length;

  const toggleExpand = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const markReviewed = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setReviewed(prev => new Set([...prev, id]));
  };

  // Group by sector if enabled
  const renderList = (traders: AuditTrader[]) => traders.map((trader, index) => {
    const isExpanded = expanded.has(trader.id);
    const levelColors = {
      critical: "border-red-200 bg-red-50/30",
      high: "border-orange-200 bg-orange-50/20",
      medium: "border-amber-100",
      low: "",
    };

    return (
      <div key={trader.id} className={`rounded-lg border ${levelColors[trader.level]} overflow-hidden transition-all`}>
        {/* Main row */}
        <div
          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30"
          onClick={() => toggleExpand(trader.id)}
        >
          <span className="text-muted-foreground font-mono text-[10px] w-4 shrink-0">#{index + 1}</span>
          <RiskScoreBadge score={trader.score} level={trader.level} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{trader.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{trader.topReason}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {trader.hasAlerts && (
              <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700 px-1.5">alert</Badge>
            )}
            {trader.isNew && (
              <Badge variant="secondary" className="text-[9px] bg-blue-100 text-blue-700 px-1.5">new</Badge>
            )}
            <Badge variant="secondary" className={`text-[9px] px-1.5 ${
              trader.level === "critical" ? "bg-red-100 text-red-700" :
              trader.level === "high" ? "bg-orange-100 text-orange-700" :
              trader.level === "medium" ? "bg-amber-100 text-amber-700" :
              "bg-emerald-100 text-emerald-700"
            }`}>{trader.level}</Badge>
            {isExpanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </div>
        </div>

        {/* Expanded reasoning + actions */}
        {isExpanded && (
          <div className="border-t px-3 pb-3 pt-2.5 space-y-3">
            {/* AI reasoning */}
            <div className="rounded-md bg-muted/30 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">AI Reasoning</p>
              <p className="text-[11px] text-foreground leading-relaxed">{trader.aiReasoning}</p>
            </div>

            {/* Suggested action */}
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] font-medium">{trader.suggestedAction}</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/admin/traders" className="inline-flex">
                <Button size="sm" variant="default" className="h-7 text-[11px] px-2.5 gap-1.5 bg-red-600 hover:bg-red-700">
                  <FileSearch className="h-3 w-3" />
                  Start Audit
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] px-2.5 gap-1.5"
                onClick={() => window.open(`/admin/traders`, "_blank")}
              >
                <Target className="h-3 w-3" />
                Request Explanation
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] px-2.5 gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                onClick={(e) => markReviewed(trader.id, e)}
              >
                <CheckCircle2 className="h-3 w-3" />
                Mark as Reviewed
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  });

  const sectorGroups = groupBySector
    ? Object.entries(
        filteredTraders.reduce<Record<string, AuditTrader[]>>((acc, t) => {
          const key = SECTOR_LABELS[t.sector] ?? "Other";
          if (!acc[key]) acc[key] = [];
          acc[key].push(t);
          return acc;
        }, {}),
      )
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-red-500" />
            Audit Priority Queue
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1" />
                {criticalCount} critical
              </Badge>
            )}
            {flaggedCount > criticalCount && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
                {flaggedCount} flagged
              </Badge>
            )}
          </div>
        </div>

        {/* Filters + grouping */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-muted/20">
            {(["all", "critical", "high", "anomaly"] as FilterMode[]).map((f) => {
              const counts: Record<FilterMode, number> = {
                all: allTraders.length,
                critical: criticalCount,
                high: allTraders.filter(t => t.level === "high" || t.level === "critical").length,
                anomaly: anomalyCount,
              };
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
                    filter === f
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "anomaly" ? "New Anomalies" : f.charAt(0).toUpperCase() + f.slice(1)}
                  {counts[f] > 0 && <span className="ml-1 text-[9px] opacity-60">({counts[f]})</span>}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setGroupBySector(g => !g)}
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border transition-colors ${
              groupBySector ? "bg-violet-50 border-violet-200 text-violet-700" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-3 w-3" />
            Group by sector
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {filteredTraders.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-500 mb-2" />
            <p className="text-xs text-muted-foreground">No traders match this filter</p>
          </div>
        ) : sectorGroups ? (
          <div className="space-y-4">
            {sectorGroups.map(([sector, traders]) => (
              <div key={sector} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <MapPin className="h-3 w-3 text-violet-500" />
                  {sector}
                  <span className="font-normal">· {traders.length} trader{traders.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-1.5">{renderList(traders)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">{renderList(filteredTraders)}</div>
        )}
      </CardContent>
    </Card>
  );
}

function buildPriorityList(
  riskData: RiskHeatmapData | null,
  alertData: SmartAlertsData | null,
): AuditTrader[] {
  const traderMap = new Map<string, AuditTrader>();

  if (riskData?.topRiskTraders) {
    for (const t of riskData.topRiskTraders) {
      const partial = { score: t.score, level: t.level, topReason: t.topReason, hasAlerts: false, alertTypes: [] as string[] };
      traderMap.set(t.id, {
        id: t.id,
        name: t.name,
        score: t.score,
        level: t.level,
        topReason: t.topReason,
        aiReasoning: buildAIReasoning(partial),
        hasAlerts: false,
        alertTypes: [],
        sector: (t as unknown as { role?: string }).role ?? "retailer",
        suggestedAction: deriveSuggestedAction(t.level, t.topReason, false),
        isNew: false,
      });
    }
  }

  if (alertData?.alerts) {
    for (const alert of alertData.alerts) {
      if (alert.severity === "info") continue;
      const existing = traderMap.get(alert.traderId);
      const alertLabel = alert.type.replace(/_/g, " ");
      if (existing) {
        existing.hasAlerts = true;
        existing.alertTypes.push(alertLabel);
        if (alert.severity === "critical" && existing.level !== "critical") {
          existing.score = Math.min(100, existing.score + 20);
          existing.level = existing.score >= 75 ? "critical" : existing.score >= 50 ? "high" : existing.level;
        }
        existing.aiReasoning = buildAIReasoning(existing);
        existing.suggestedAction = deriveSuggestedAction(existing.level, existing.topReason, true);
        existing.isNew = true;
      } else {
        const alertScore = alert.severity === "critical" ? 72 : 42;
        const level: AuditTrader["level"] = alertScore >= 75 ? "critical" : alertScore >= 50 ? "high" : "medium";
        const partial = { score: alertScore, level, topReason: alert.title, hasAlerts: true, alertTypes: [alertLabel] };
        traderMap.set(alert.traderId, {
          id: alert.traderId,
          name: alert.traderName,
          score: alertScore,
          level,
          topReason: alert.title,
          aiReasoning: buildAIReasoning(partial),
          hasAlerts: true,
          alertTypes: [alertLabel],
          sector: "retailer",
          suggestedAction: deriveSuggestedAction(level, alert.title, true),
          isNew: true,
        });
      }
    }
  }

  return Array.from(traderMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}
