import { requireRRASession } from "@/lib/auth-guard";
import { getUnregisteredBuyers, getRegistrationTimeliness } from "@/lib/actions/admin-taxpayer-discovery.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserSearch, Clock, AlertTriangle } from "lucide-react";

export default async function UnregisteredTaxpayersPage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const [buyers, timeliness] = await Promise.all([
        getUnregisteredBuyers(),
        getRegistrationTimeliness(),
    ]);

    const frequentBuyers = buyers.filter((b) => b.transactionCount >= 3);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Taxpayer Discovery
                </h1>
                <p className="text-muted-foreground">
                    Identify unregistered buyers and monitor registration timeliness.
                </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <UserSearch className="h-8 w-8 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Unique Consumer Buyers
                            </p>
                            <p className="text-2xl font-bold">{buyers.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Frequent Buyers (3+ purchases)
                            </p>
                            <p className="text-2xl font-bold">{frequentBuyers.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-3">
                        <Clock className="h-8 w-8 text-blue-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Registered Traders
                            </p>
                            <p className="text-2xl font-bold">{timeliness.length}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Unregistered Buyers */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Potential Unregistered Taxpayers
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {buyers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No unregistered buyers detected.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Buyer Name</TableHead>
                                    <TableHead className="text-right">Purchases</TableHead>
                                    <TableHead className="text-right">Total Value</TableHead>
                                    <TableHead>Last Seen</TableHead>
                                    <TableHead>Sold By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {buyers.map((b) => (
                                    <TableRow key={b.buyerName}>
                                        <TableCell className="font-medium">
                                            {b.buyerName}
                                            {b.transactionCount >= 5 && (
                                                <Badge variant="destructive" className="ml-2 text-[10px]">
                                                    High Risk
                                                </Badge>
                                            )}
                                            {b.transactionCount >= 3 && b.transactionCount < 5 && (
                                                <Badge variant="secondary" className="ml-2 text-[10px]">
                                                    Frequent
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {b.transactionCount}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatRWF(b.totalValue)}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(b.lastSeenAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {b.sellerNames.slice(0, 2).join(", ")}
                                            {b.sellerNames.length > 2 && ` +${b.sellerNames.length - 2}`}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Registration Timeliness */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Registration Timeliness
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Trader</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Registered</TableHead>
                                <TableHead>First Transaction</TableHead>
                                <TableHead className="text-right">Days Gap</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {timeliness.slice(0, 20).map((t) => (
                                <TableRow key={t.traderId}>
                                    <TableCell className="font-medium">{t.traderName}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-[10px] capitalize">
                                            {t.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(t.registeredAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {t.firstTransactionAt
                                            ? new Date(t.firstTransactionAt).toLocaleDateString()
                                            : "Never traded"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {t.daysBetween !== null ? `${t.daysBetween}d` : "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
