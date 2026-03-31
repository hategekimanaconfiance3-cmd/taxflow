import { requireRRASession } from "@/lib/auth-guard";
import { getTrader, getTraderTransactions } from "@/lib/actions/admin.action";
import { getTraderTaxReport } from "@/lib/actions/admin-report.action";
import { getTraderStock } from "@/lib/actions/admin-stock.action";
import { ClearanceStatusBadge } from "@/components/dashboard/status-badges/status-badges";
import { TransactionStatusBadge } from "@/components/dashboard/status-badges/status-badges";
import { AdminClearanceActions } from "@/components/admin/admin-clearance-actions";
import { EditTaxpayerDialog } from "@/components/admin/edit-taxpayer-dialog";
import { StartAuditDialog, FlagActivityDialog } from "@/components/admin/compliance-dialogs";
import { StatCard, formatRWF } from "@/components/dashboard/stat-card/stat-card";
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
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
    TrendingUp,
    TrendingDown,
    Calculator,
    CreditCard,
    Package,
    ArrowLeftRight,
    CheckCircle,
    AlertTriangle,
} from "lucide-react";
import { notFound } from "next/navigation";

export default async function TraderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { staff } = await requireRRASession();
    const isAdmin =
        staff.clearanceLevel === "admin" ||
        staff.clearanceLevel === "super_admin";
    const isSenior =
        isAdmin || staff.clearanceLevel === "senior_officer";
    const { id } = await params;

    let trader;
    try {
        trader = await getTrader(id);
    } catch {
        notFound();
    }

    const [taxReport, transactions, inventory] = await Promise.all([
        getTraderTaxReport(id),
        getTraderTransactions(id),
        getTraderStock(id),
    ]);

    const recentTransactions = transactions.slice(0, 10);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {trader.businessName ?? trader.name}
                    </h1>
                    <p className="text-muted-foreground">
                        Business profile, compliance, and activity overview.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {isSenior && (
                        <StartAuditDialog
                            traderId={trader.id}
                            traderName={trader.businessName ?? trader.name}
                        />
                    )}
                    {isSenior && (
                        <FlagActivityDialog
                            targetId={trader.id}
                            targetType="user"
                            targetName={trader.businessName ?? trader.name}
                        />
                    )}
                    {isSenior && (
                        <EditTaxpayerDialog
                            traderId={trader.id}
                            currentName={trader.name}
                            currentBusinessName={trader.businessName}
                            currentPhone={trader.phoneNumber}
                            currentEmail={trader.email}
                        />
                    )}
                    {isAdmin && (
                        <AdminClearanceActions
                            traderId={trader.id}
                            traderName={
                                trader.businessName ?? trader.name
                            }
                            currentStatus={trader.clearanceStatus}
                        />
                    )}
                </div>
            </div>

            {/* Profile Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Business Profile
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Owner</p>
                            <p className="font-medium">{trader.name}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">TIN</p>
                            <p className="font-mono font-medium">
                                {trader.tinNumber ?? "—"}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Phone</p>
                            <p className="font-medium">
                                {trader.phoneNumber ?? "—"}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Email</p>
                            <p className="font-medium">{trader.email}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Role</p>
                            <Badge
                                variant="outline"
                                className="text-xs capitalize mt-1"
                            >
                                {trader.role}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Clearance</p>
                            <ClearanceStatusBadge
                                status={trader.clearanceStatus}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    <p className="text-sm text-muted-foreground">
                        Registered on{" "}
                        {new Date(trader.createdAt).toLocaleDateString(
                            "en-RW",
                            {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            },
                        )}
                    </p>
                </CardContent>
            </Card>

            {/* Compliance & VAT Summary */}
            {taxReport && (
                <>
                    {/* Compliance Score */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                {taxReport.compliancePct >= 95 ? (
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                )}
                                Compliance Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">
                                        Compliance Score
                                    </span>
                                    <Badge
                                        variant="secondary"
                                        className={
                                            taxReport.compliancePct >= 95
                                                ? "bg-emerald-500/10 text-emerald-600"
                                                : taxReport.compliancePct >= 50
                                                    ? "bg-amber-500/10 text-amber-600"
                                                    : "bg-red-500/10 text-red-600"
                                        }
                                    >
                                        {taxReport.compliancePct}%
                                    </Badge>
                                </div>
                                <Progress
                                    value={taxReport.compliancePct}
                                    className="h-2"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {taxReport.compliancePct >= 95
                                        ? "This business is fully compliant."
                                        : taxReport.compliancePct >= 50
                                            ? "This business has outstanding payments."
                                            : "This business has significant compliance issues."}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* VAT Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="VAT Output"
                            value={formatRWF(taxReport.vatOutput)}
                            description="Collected from sales"
                            icon={<TrendingUp className="h-4 w-4" />}
                        />
                        <StatCard
                            title="VAT Input"
                            value={formatRWF(taxReport.vatInput)}
                            description="Claimed from purchases"
                            icon={<TrendingDown className="h-4 w-4" />}
                        />
                        <StatCard
                            title="Net VAT Due"
                            value={formatRWF(taxReport.netVatDue)}
                            description={`Outstanding: ${formatRWF(taxReport.outstanding)}`}
                            icon={<Calculator className="h-4 w-4" />}
                        />
                        <StatCard
                            title="Payments Made"
                            value={formatRWF(taxReport.totalPaid)}
                            description={`${taxReport.paymentCount} confirmed payments`}
                            icon={<CreditCard className="h-4 w-4" />}
                        />
                    </div>
                </>
            )}

            {/* Stock Inventory */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Stock Inventory ({inventory.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {inventory.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No stock records for this business.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">
                                        Quantity
                                    </TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">
                                        Last Updated
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {inventory.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">
                                            {item.productName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {item.quantity.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {item.productUnit}
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-muted-foreground">
                                            {new Date(
                                                item.updatedAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4" />
                        Recent Transactions ({transactions.length} total)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {recentTransactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No transactions for this business.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Direction</TableHead>
                                    <TableHead className="text-right">
                                        Qty
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Amount
                                    </TableHead>
                                    <TableHead className="text-right">
                                        VAT
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">
                                        Date
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentTransactions.map((txn) => (
                                    <TableRow key={txn.id}>
                                        <TableCell className="font-medium text-sm">
                                            {txn.productName}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ${txn.sellerId === id
                                                    ? "text-red-600 border-red-200"
                                                    : "text-emerald-600 border-emerald-200"
                                                    }`}
                                            >
                                                {txn.sellerId === id
                                                    ? "Sold"
                                                    : "Bought"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {txn.quantity}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {formatRWF(txn.totalAmount)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                            {formatRWF(txn.vatAmount)}
                                        </TableCell>
                                        <TableCell>
                                            <TransactionStatusBadge
                                                status={txn.status}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-muted-foreground">
                                            {new Date(
                                                txn.createdAt,
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
