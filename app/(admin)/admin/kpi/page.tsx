import { requireRRASession } from "@/lib/auth-guard";
import { getKpiTargets, getKpiProgress } from "@/lib/actions/kpi-targets.action";
import { KpiTargetForm } from "@/components/admin/kpi-target-form";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Target, TrendingUp, Users, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Inline progress-bar primitive
// ---------------------------------------------------------------------------

function ProgressBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-full bg-muted rounded-full h-2.5">
            <div
                className={`h-2.5 rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Progress color helper
// ---------------------------------------------------------------------------

function progressColor(pct: number): string {
    if (pct >= 90) return "bg-green-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-red-500";
}

// ---------------------------------------------------------------------------
// Month label helper — "2026-10" → "October 2026"
// ---------------------------------------------------------------------------

function formatMonthLabel(yyyyMm: string): string {
    const [year, month] = yyyyMm.split("-");
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function KpiTargetsPage() {
    await requireRRASession("super_admin");

    const targets = await getKpiTargets();
    const progress = await getKpiProgress(targets.targetMonth);

    // --- VAT Revenue ---
    const vatPct =
        targets.vatTarget > 0
            ? Math.round((progress.vatCollected / targets.vatTarget) * 100)
            : 0;

    // --- Trader Registrations ---
    const traderPct =
        targets.traderTarget > 0
            ? Math.round((progress.newTraders / targets.traderTarget) * 100)
            : 0;

    // --- Compliance Rate ---
    const compliancePct =
        targets.complianceTarget > 0
            ? Math.round((progress.complianceRate / targets.complianceTarget) * 100)
            : 0;

    return (
        <div className="space-y-8 p-6">
            {/* ── Header ── */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Target className="h-6 w-6 text-primary" />
                    KPI Targets
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Set and track monthly performance targets
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium">
                    <TrendingUp className="h-4 w-4" />
                    Target Month: {formatMonthLabel(targets.targetMonth)}
                </div>
            </div>

            {/* ── Progress Cards ── */}
            <section>
                <h2 className="text-base font-semibold mb-4">Progress Overview</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

                    {/* Card 1 — VAT Revenue */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                VAT Revenue Collected
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-2xl font-bold">
                                    {formatRWF(progress.vatCollected)}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    Target: {formatRWF(targets.vatTarget)}
                                </div>
                            </div>
                            <ProgressBar value={vatPct} color={progressColor(vatPct)} />
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{vatPct}% of target</span>
                                {progress.vatGenerated > 0 && (
                                    <span className="text-muted-foreground">
                                        Generated: {formatRWF(progress.vatGenerated)}
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Card 2 — New Trader Registrations */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                New Trader Registrations
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-2xl font-bold">
                                    {progress.newTraders.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    Target: {targets.traderTarget.toLocaleString()}
                                </div>
                            </div>
                            <ProgressBar value={traderPct} color={progressColor(traderPct)} />
                            <div className="text-xs font-medium">
                                {traderPct}% of target
                            </div>
                        </CardContent>
                    </Card>

                    {/* Card 3 — Platform Compliance Rate */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                Platform Compliance Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-2xl font-bold">
                                    {(progress.complianceRate * 100).toFixed(1)}%
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    Target: {(targets.complianceTarget * 100).toFixed(0)}%
                                </div>
                            </div>
                            <ProgressBar value={compliancePct} color={progressColor(compliancePct)} />
                            <div className="text-xs font-medium">
                                {compliancePct}% of target
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </section>

            {/* ── Set Targets Form ── */}
            <section>
                <h2 className="text-base font-semibold mb-4">Set Targets</h2>
                <div className="max-w-lg">
                    <KpiTargetForm
                        vatTarget={targets.vatTarget}
                        traderTarget={targets.traderTarget}
                        complianceTarget={targets.complianceTarget}
                        targetMonth={targets.targetMonth}
                    />
                </div>
            </section>
        </div>
    );
}
