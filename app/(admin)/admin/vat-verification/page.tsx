import { requireRRASession } from "@/lib/auth-guard";
import { getVatVerification } from "@/lib/actions/admin-vat-verify.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<
    string,
    { label: string; color: string; bg: string }
> = {
    matching: {
        label: "Match",
        color: "text-emerald-600",
        bg: "bg-emerald-500/10",
    },
    minor: {
        label: "Minor",
        color: "text-amber-600",
        bg: "bg-amber-500/10",
    },
    significant: {
        label: "Significant",
        color: "text-orange-600",
        bg: "bg-orange-500/10",
    },
    critical: {
        label: "Critical",
        color: "text-red-600",
        bg: "bg-red-500/10",
    },
};

export default async function VatVerificationPage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const results = await getVatVerification();

    const criticalCount = results.filter((r) => r.status === "critical").length;
    const sigCount = results.filter((r) => r.status === "significant").length;
    const matchCount = results.filter((r) => r.status === "matching").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    VAT Verification
                </h1>
                <p className="text-muted-foreground">
                    Compare declared VAT returns against actual transaction
                    data.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">
                            Total Traders
                        </p>
                        <p className="text-2xl font-bold">{results.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-emerald-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Matching
                            </p>
                            <p className="text-2xl font-bold">{matchCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertTriangle className="h-6 w-6 text-orange-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Significant
                            </p>
                            <p className="text-2xl font-bold">{sigCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <ShieldAlert className="h-6 w-6 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Critical
                            </p>
                            <p className="text-2xl font-bold">
                                {criticalCount}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Discrepancy table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Declared vs Actual VAT
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {results.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No traders with VAT data.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Business</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-right">
                                            Declared Output
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Actual Output
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Declared Input
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Actual Input
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Disc. %
                                        </TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((r) => {
                                        const cfg =
                                            STATUS_CONFIG[r.status] ??
                                            STATUS_CONFIG.matching;
                                        return (
                                            <TableRow key={r.traderId}>
                                                <TableCell>
                                                    <Link
                                                        href={`/admin/traders/${r.traderId}`}
                                                        className="text-sm font-medium hover:underline"
                                                    >
                                                        {r.traderName}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] capitalize"
                                                    >
                                                        {r.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {formatRWF(
                                                        r.declaredOutput,
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {formatRWF(r.actualOutput)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {formatRWF(
                                                        r.declaredInput,
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {formatRWF(r.actualInput)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span
                                                        className={`font-mono text-sm font-medium ${cfg.color}`}
                                                    >
                                                        {r.discrepancyPct}%
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] ${cfg.color} ${cfg.bg}`}
                                                    >
                                                        {cfg.label}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
