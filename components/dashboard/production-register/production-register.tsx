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

interface ProductWithStock {
    id: string;
    name: string;
    unit: string;
    categoryCode: string | null;
    createdAt: Date;
    quantity: number;
    latestUnitPrice?: number | null;
}

interface ProductionRegisterProps {
    products: ProductWithStock[];
}

export function ProductionRegister({ products }: ProductionRegisterProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base font-semibold">
                    Production Register
                </CardTitle>
            </CardHeader>
            <CardContent>
                {products.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        No products registered yet. Create your first product
                        above.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">
                                    Quantity
                                </TableHead>
                                <TableHead className="text-right">
                                    Unit Price
                                </TableHead>
                                <TableHead className="text-right">
                                    Total Value
                                </TableHead>
                                <TableHead className="text-right">
                                    Potential Tax
                                </TableHead>
                                <TableHead className="text-right">
                                    Date
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.map((prod, idx) => {
                                const price = prod.latestUnitPrice
                                    ? Number(prod.latestUnitPrice)
                                    : 0;
                                const totalValue = prod.quantity * price;
                                const potentialTax = Math.round(
                                    totalValue * 0.18,
                                );
                                return (
                                    <TableRow key={prod.id}>
                                        <TableCell className="text-muted-foreground">
                                            {idx + 1}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {prod.name}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {prod.quantity.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {price > 0
                                                ? formatRWF(price)
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium">
                                            {totalValue > 0
                                                ? formatRWF(totalValue)
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-emerald-600">
                                            {potentialTax > 0
                                                ? formatRWF(potentialTax)
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-muted-foreground">
                                            {new Date(
                                                prod.createdAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
