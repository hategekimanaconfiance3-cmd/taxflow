import { requireRRASession } from "@/lib/auth-guard";
import { getSystemStockOverview } from "@/lib/actions/admin-stock.action";
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
import { Package } from "lucide-react";
import Link from "next/link";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
    EditStockDialog,
    DeleteStockDialog,
} from "@/components/admin/stock-correction-dialogs";

export default async function StockPage() {
    const { staff } = await requireRRASession(
        "audit_officer",
        "stock_officer",
        "correction_officer",
    );
    const stockItems = await getSystemStockOverview();

    const canCorrect =
        staff.clearanceLevel === "correction_officer" ||
        staff.clearanceLevel === "super_admin";

    // Group by product for summary stats
    const productMap = new Map<
        string,
        { name: string; unit: string; totalQty: number; businessCount: number }
    >();

    for (const item of stockItems) {
        const existing = productMap.get(item.productId);
        if (existing) {
            existing.totalQty += item.quantity;
            existing.businessCount += 1;
        } else {
            productMap.set(item.productId, {
                name: item.productName,
                unit: item.productUnit,
                totalQty: item.quantity,
                businessCount: 1,
            });
        }
    }

    const productSummaries = [...productMap.values()].sort(
        (a, b) => b.totalQty - a.totalQty,
    );

    const totalProducts = productMap.size;
    const totalStock = stockItems.reduce((s, i) => s + i.quantity, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Stock Overview
                </h1>
                <p className="text-muted-foreground">
                    System-wide inventory levels across all businesses.
                </p>
            </div>

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">
                            Total Products
                        </p>
                        <p className="text-2xl font-bold">{totalProducts}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">
                            Total Stock Units
                        </p>
                        <p className="text-2xl font-bold">
                            {totalStock.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">
                            Stock Entries
                        </p>
                        <p className="text-2xl font-bold">{stockItems.length}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Product summaries */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Product Summary
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {productSummaries.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No stock data available.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">
                                        Total Qty
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Businesses
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {productSummaries.map((ps) => (
                                    <TableRow key={ps.name}>
                                        <TableCell className="font-medium">
                                            {ps.name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {ps.unit}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {ps.totalQty.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {ps.businessCount}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Detailed stock per business */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Stock by Business
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {stockItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No stock entries.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Business</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">
                                            Quantity
                                        </TableHead>
                                        <TableHead>Unit</TableHead>
                                        <TableHead className="text-right">
                                            Price (RWF)
                                        </TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead className="text-right">
                                            Last Updated
                                        </TableHead>
                                        {canCorrect && (
                                            <TableHead className="text-right">
                                                Actions
                                            </TableHead>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stockItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Link
                                                    href={`/admin/traders/${item.businessId}`}
                                                    className="text-sm font-medium hover:underline"
                                                >
                                                    {item.businessName ??
                                                        item.ownerName}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] capitalize"
                                                >
                                                    {item.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {item.productName}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {item.quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {item.productUnit}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {item.price
                                                    ? formatRWF(item.price)
                                                    : "—"}
                                            </TableCell>
                                            <TableCell>
                                                {item.source ? (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] capitalize"
                                                    >
                                                        {item.source}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">
                                                {new Date(
                                                    item.updatedAt,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            {canCorrect && (
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <EditStockDialog
                                                            row={{
                                                                id: item.id,
                                                                quantity: item.quantity,
                                                                price: item.price,
                                                                source: item.source,
                                                                productName: item.productName,
                                                                productUnit: item.productUnit,
                                                            }}
                                                        />
                                                        <DeleteStockDialog
                                                            row={{
                                                                id: item.id,
                                                                quantity: item.quantity,
                                                                price: item.price,
                                                                source: item.source,
                                                                productName: item.productName,
                                                                productUnit: item.productUnit,
                                                            }}
                                                        />
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
