import { requireTraderSession } from "@/lib/auth-guard";
import { getDisputes } from "@/lib/actions/dispute.action";
import { getOutgoingTransactions } from "@/lib/actions/transaction.action";
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
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, Clock, FileText, ArrowRight, CheckCircle } from "lucide-react";
import { FileDisputeForm } from "@/components/dashboard/dispute-form/file-dispute-form";
import { DisputeResponseActions } from "@/components/dashboard/dispute-form/dispute-response-actions";
import { DisputeRealtimeWrapper } from "@/components/dashboard/dispute-form/dispute-realtime-wrapper";

export default async function DisputesPage() {
    const session = await requireTraderSession();
    const [disputes, transactions] = await Promise.all([
        getDisputes(),
        getOutgoingTransactions(),
    ]);

    // Filter only recent confirmed/completed transactions for the dropdown
    const recentTxns = transactions
        .filter((t) => t.status === "confirmed" || t.status === "completed")
        .slice(0, 20);

    const filedByMe = disputes.filter((d) => d.myRole === "filer");
    const incoming = disputes.filter((d) => d.myRole === "counterparty");
    const pendingResponse = incoming.filter(
        (d) => d.counterpartyResponse === "pending",
    ).length;
    const underReview = disputes.filter(
        (d) => d.status === "under_review",
    ).length;
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
        <DisputeRealtimeWrapper>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Dispute Resolution
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        File disputes on transactions within 48 hours. Both parties
                        must respond before RRA reviews and takes action.
                    </p>
                </div>

                {/* Summary */}
                <div className="grid gap-4 sm:grid-cols-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-amber-500">
                                    <AlertTriangle className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        Needs Your Response
                                    </p>
                                    <p className="text-lg font-bold">
                                        {pendingResponse}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-blue-500">
                                    <Clock className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        Under RRA Review
                                    </p>
                                    <p className="text-lg font-bold">
                                        {underReview}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-emerald-500">
                                    <CheckCircle className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        Resolved
                                    </p>
                                    <p className="text-lg font-bold">{resolved}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                    <Shield className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-medium text-muted-foreground">
                                        Total
                                    </p>
                                    <p className="text-lg font-bold">
                                        {disputes.length}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Pending Responses — Incoming disputes needing your attention */}
                {pendingResponse > 0 && (
                    <Card className="border-amber-200 bg-amber-50/30">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Action Required — Respond to Disputes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Filed</TableHead>
                                        <TableHead className="text-right">
                                            Your Response
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incoming
                                        .filter(
                                            (d) =>
                                                d.counterpartyResponse === "pending",
                                        )
                                        .map((d) => (
                                            <TableRow key={d.id}>
                                                <TableCell className="font-mono text-sm font-semibold">
                                                    {d.referenceNumber}
                                                </TableCell>
                                                <TableCell className="max-w-[250px]">
                                                    <p className="text-sm truncate">
                                                        {d.reason}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(
                                                        d.createdAt,
                                                    ).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DisputeResponseActions
                                                        disputeId={d.id}
                                                        referenceNumber={
                                                            d.referenceNumber
                                                        }
                                                        reason={d.reason}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* File New Dispute */}
                <FileDisputeForm
                    transactions={recentTxns.map((t) => ({
                        id: t.id,
                        productName: t.productName,
                        quantity: t.quantity,
                        totalAmount: t.totalAmount,
                        createdAt: t.createdAt.toISOString(),
                    }))}
                />

                {/* All Disputes History */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Dispute History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {disputes.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">
                                No disputes yet.
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Your Role</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Response</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>RRA Decision</TableHead>
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
                                                <Badge
                                                    variant="outline"
                                                    className="text-xs"
                                                >
                                                    {d.myRole === "filer"
                                                        ? "Filed by you"
                                                        : "Against you"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[150px] truncate text-sm">
                                                {d.reason}
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
                                                    <div>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs"
                                                        >
                                                            {actionLabels[
                                                                d.rraAction
                                                            ] || d.rraAction}
                                                        </Badge>
                                                        {d.rraOfficialNote && (
                                                            <p className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                                                                {d.rraOfficialNote}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">
                                                        —
                                                    </span>
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
        </DisputeRealtimeWrapper>
    );
}
