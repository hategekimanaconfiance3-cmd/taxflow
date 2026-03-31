import { requireRRASession } from "@/lib/auth-guard";
import { getAllDisputes } from "@/lib/actions/dispute.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Shield, AlertTriangle, Clock, CheckCircle, ArrowRight } from "lucide-react";
import { AdminDisputeActions } from "@/components/admin/admin-dispute-actions";

export default async function AdminDisputesPage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const disputes = await getAllDisputes();

    const underReview = disputes.filter(
        (d) => d.status === "under_review",
    ).length;
    const filed = disputes.filter((d) => d.status === "filed").length;
    const resolved = disputes.filter(
        (d) => d.status === "resolved" || d.status === "dismissed",
    ).length;

    const statusColors: Record<string, string> = {
        filed: "bg-amber-500/10 text-amber-600",
        under_review: "bg-blue-500/10 text-blue-600",
        resolved: "bg-emerald-500/10 text-emerald-600",
        dismissed: "bg-zinc-500/10 text-zinc-600",
    };

    const responseColors: Record<string, string> = {
        pending: "bg-amber-500/10 text-amber-600",
        acknowledged: "bg-emerald-500/10 text-emerald-600",
        contested: "bg-red-500/10 text-red-600",
    };

    const actionLabels: Record<string, string> = {
        undo_transaction: "Transaction Undone",
        adjust_amount: "Amount Adjusted",
        uphold_dispute: "Dispute Upheld",
        dismiss: "Dismissed",
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Dispute Management
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Review disputes after both parties have responded.
                        Take action and issue official communications.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="text-sm gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {underReview} ready for review
                    </Badge>
                    <Badge variant="outline" className="text-sm gap-1 text-amber-600">
                        {filed} awaiting parties
                    </Badge>
                </div>
            </div>

            {/* Disputes ready for RRA action */}
            {underReview > 0 && (
                <Card className="border-blue-200 bg-blue-50/30">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Ready for Review — Both Parties Responded
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Filer</TableHead>
                                    <TableHead>Counterparty</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Response</TableHead>
                                    <TableHead className="text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {disputes
                                    .filter(
                                        (d) => d.status === "under_review",
                                    )
                                    .map((d) => (
                                        <TableRow key={d.id}>
                                            <TableCell className="font-mono text-sm font-semibold">
                                                {d.referenceNumber}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium text-sm">
                                                        {d.filedByName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        {d.filedByTin}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium text-sm">
                                                        {d.counterpartyName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        {d.counterpartyTin}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-[150px] truncate text-sm">
                                                {d.reason}
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <Badge
                                                        variant="secondary"
                                                        className={`text-xs ${responseColors[d.counterpartyResponse] || ""}`}
                                                    >
                                                        {d.counterpartyResponse}
                                                    </Badge>
                                                    {d.counterpartyNote && (
                                                        <p className="text-xs text-muted-foreground max-w-[120px] truncate">
                                                            &ldquo;{d.counterpartyNote}&rdquo;
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <AdminDisputeActions
                                                    disputeId={d.id}
                                                    referenceNumber={
                                                        d.referenceNumber
                                                    }
                                                    filerName={d.filedByName || ""}
                                                    counterpartyName={d.counterpartyName || ""}
                                                    reason={d.reason}
                                                    counterpartyResponse={d.counterpartyResponse}
                                                    counterpartyNote={d.counterpartyNote}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* All disputes */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        All Disputes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {disputes.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No disputes filed.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Filer</TableHead>
                                    <TableHead>Counterparty</TableHead>
                                    <TableHead>Response</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>RRA Action</TableHead>
                                    <TableHead>Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {disputes.map((d) => (
                                    <TableRow key={d.id}>
                                        <TableCell className="font-mono text-sm font-semibold">
                                            {d.referenceNumber}
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {d.filedByName}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {d.counterpartyName}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${responseColors[d.counterpartyResponse] || ""}`}
                                            >
                                                {d.counterpartyResponse}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={
                                                    statusColors[d.status] || ""
                                                }
                                            >
                                                {d.status.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {d.rraAction ? (
                                                <Badge variant="outline" className="text-xs">
                                                    {actionLabels[d.rraAction] || d.rraAction}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(
                                                d.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
