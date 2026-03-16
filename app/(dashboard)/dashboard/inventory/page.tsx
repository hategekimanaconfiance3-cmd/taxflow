import { requireTraderSession } from "@/lib/auth-guard";
import { getInventory } from "@/lib/actions/stock.action";
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
import { Package } from "lucide-react";

export default async function InventoryPage() {
    const session = await requireTraderSession();
    const inventory = await getInventory();

    const totalStock = inventory.reduce((sum, s) => sum + s.quantity, 0);
    const productCount = inventory.length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
                <p className="text-muted-foreground">
                    Manage your product stock levels.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="Products"
                    value={productCount}
                    icon={<Package className="h-4 w-4" />}
                />
                <StatCard
                    title="Total Units"
                    value={totalStock.toLocaleString()}
                    description="Across all products"
                />
                <StatCard
                    title="Low Stock"
                    value={inventory.filter((s) => s.quantity < 10).length}
                    description="Below 10 units"
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Stock Overview
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {inventory.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No products in inventory yet.
                            {session.user.role === "manufacturer"
                                ? " Record your first production run."
                                : " Products will appear when you confirm a purchase."}
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">
                                        Price/Unit
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Quantity
                                    </TableHead>
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
                                        <TableCell className="text-muted-foreground">
                                            {item.productUnit}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {item.latestUnitPrice
                                                ? formatRWF(Number(item.latestUnitPrice))
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {item.quantity.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground text-sm">
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
        </div>
    );
}
