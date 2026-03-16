import { requireRRASession } from "@/lib/auth-guard";
import { getAllTraders } from "@/lib/actions/admin.action";
import { ClearanceStatusBadge } from "@/components/dashboard/status-badges/status-badges";
import { AdminClearanceActions } from "@/components/admin/admin-clearance-actions";
import { RiskScoreBadge } from "@/components/admin/risk-score-badge";
import { computeAllRiskScores } from "@/lib/ai/risk-scoring";
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
import { Users } from "lucide-react";
import Link from "next/link";

export default async function TradersPage() {
    const { staff } = await requireRRASession();
    const isAdmin =
        staff.clearanceLevel === "admin" ||
        staff.clearanceLevel === "super_admin";
    const [traders, riskScores] = await Promise.all([
        getAllTraders(),
        computeAllRiskScores(),
    ]);

    // Build lookup map for O(1) access per trader row
    const riskMap = new Map(riskScores.map((s) => [s.merchantId, s]));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Registered Traders
                </h1>
                <p className="text-muted-foreground">
                    View and manage all businesses in the supply chain.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        All Traders ({traders.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {traders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No traders registered yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Business Name</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead>TIN</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Risk</TableHead>
                                    <TableHead>Clearance</TableHead>
                                    <TableHead className="text-right">
                                        Joined
                                    </TableHead>
                                    {isAdmin && (
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {traders.map((trader) => {
                                    const risk = riskMap.get(trader.id);
                                    return (
                                        <TableRow key={trader.id}>
                                            <TableCell className="font-medium">
                                                <Link
                                                    href={`/admin/traders/${trader.id}`}
                                                    className="hover:underline"
                                                >
                                                    {trader.businessName ?? "—"}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{trader.name}</TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">
                                                {trader.tinNumber ?? "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {trader.phoneNumber ?? "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className="text-xs capitalize"
                                                >
                                                    {trader.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {risk ? (
                                                    <RiskScoreBadge
                                                        score={risk.score}
                                                        level={risk.level}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <ClearanceStatusBadge
                                                    status={trader.clearanceStatus}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">
                                                {new Date(
                                                    trader.createdAt,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right">
                                                    <AdminClearanceActions
                                                        traderId={trader.id}
                                                        traderName={
                                                            trader.businessName ??
                                                            trader.name
                                                        }
                                                        currentStatus={
                                                            trader.clearanceStatus
                                                        }
                                                    />
                                                </TableCell>
                                            )}
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
