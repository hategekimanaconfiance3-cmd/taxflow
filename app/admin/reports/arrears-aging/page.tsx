import { requireRRASession } from "@/lib/auth-guard";
import { getArrearsAging } from "@/lib/actions/admin-arrears-aging.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, AlertTriangle, XCircle } from "lucide-react";

const BUCKET_CONFIG = {
    current: { label: "Current (0–30 days)", color: "text-green-500", icon: Clock, variant: "outline" as const },
    overdue: { label: "Overdue (31–60 days)", color: "text-amber-500", icon: AlertCircle, variant: "secondary" as const },
    delinquent: { label: "Delinquent (61–90 days)", color: "text-orange-500", icon: AlertTriangle, variant: "secondary" as const },
    critical: { label: "Critical (90+ days)", color: "text-red-500", icon: XCircle, variant: "destructive" as const },
};

export default async function ArrearsAgingPage() {
    await requireRRASession("compliance_officer", "audit_officer", "reporting_officer");
    const aging = await getArrearsAging();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Tax Arrears Aging Report
                </h1>
                <p className="text-muted-foreground">
                    Outstanding tax balances by age bucket.
                </p>
            </div>

            {/* Aging Bucket Summary */}
            <div className="grid gap-4 md:grid-cols-4">
                {(Object.entries(BUCKET_CONFIG) as Array<[keyof typeof BUCKET_CONFIG, typeof BUCKET_CONFIG[keyof typeof BUCKET_CONFIG]]>).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const bucket = aging[key];
                    return (
                        <Card key={key}>
                            <CardContent className="pt-6 flex items-center gap-3">
                                <Icon className={`h-8 w-8 ${cfg.color}`} />
                                <div>
                                    <p className="text-sm text-muted-foreground">{cfg.label}</p>
                                    <p className="text-2xl font-bold">{bucket.count}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatRWF(bucket.total)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Grand Total */}
            <Card>
                <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground">Total Outstanding Arrears</p>
                    <p className="text-3xl font-bold text-red-600">
                        {formatRWF(aging.grandTotal)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        across {aging.traders.length} traders
                    </p>
                </CardContent>
            </Card>

            {/* Detailed Trader Arrears */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Trader Arrears Detail
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {aging.traders.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No outstanding arrears.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Trader</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Aging</TableHead>
                                    <TableHead className="text-right">Owed</TableHead>
                                    <TableHead className="text-right">Paid</TableHead>
                                    <TableHead className="text-right">Outstanding</TableHead>
                                    <TableHead className="text-right">Days</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {aging.traders.map((t) => {
                                    const cfg = BUCKET_CONFIG[t.agingBucket];
                                    return (
                                        <TableRow key={t.traderId}>
                                            <TableCell className="font-medium">{t.traderName}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] capitalize">
                                                    {t.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={cfg.variant} className="text-[10px]">
                                                    {t.agingBucket}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatRWF(t.totalOwed)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatRWF(t.totalPaid)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm font-medium text-red-600">
                                                {formatRWF(t.outstanding)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {t.daysSinceOldest}d
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
