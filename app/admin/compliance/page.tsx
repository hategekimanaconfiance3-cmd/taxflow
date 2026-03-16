import { requireRRASession } from "@/lib/auth-guard";
import { getActiveAudits } from "@/lib/actions/admin-compliance.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
    open: { label: "Open", color: "text-blue-600 bg-blue-500/10", icon: Clock },
    in_progress: { label: "In Progress", color: "text-amber-600 bg-amber-500/10", icon: AlertTriangle },
    closed: { label: "Closed", color: "text-emerald-600 bg-emerald-500/10", icon: CheckCircle },
};

export default async function CompliancePage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const audits = await getActiveAudits();

    const openCount = audits.filter((a) => a.latestStatus === "open" || a.latestStatus === "in_progress").length;
    const closedCount = audits.filter((a) => a.latestStatus === "closed").length;
    const flaggedCount = audits.filter((a) => a.latestAction === "SUSPICIOUS_FLAGGED").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Compliance & Investigations
                </h1>
                <p className="text-muted-foreground">
                    Track audits, investigations, and flagged activity.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <ClipboardList className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Active Audits</p>
                            <p className="text-2xl font-bold">{openCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle className="h-8 w-8 text-emerald-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Closed</p>
                            <p className="text-2xl font-bold">{closedCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Flagged</p>
                            <p className="text-2xl font-bold">{flaggedCount}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Audit entries */}
            {audits.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No audits or flags recorded yet.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {audits.map((audit) => {
                        const cfg = STATUS_CONFIG[audit.latestStatus] ?? STATUS_CONFIG.open;
                        const Icon = cfg.icon;
                        return (
                            <Card key={audit.targetId}>
                                <CardContent className="py-4">
                                    <div className="flex items-start gap-3">
                                        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${cfg.color.split(" ")[0]}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Link
                                                    href={`/admin/traders/${audit.targetId}`}
                                                    className="text-sm font-medium hover:underline"
                                                >
                                                    {audit.traderName}
                                                </Link>
                                                <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                                                    {cfg.label}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px]">
                                                    {audit.latestAction.replace(/_/g, " ")}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground ml-auto">
                                                    {new Date(audit.openedAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {audit.entries.length} event{audit.entries.length !== 1 ? "s" : ""} recorded
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
