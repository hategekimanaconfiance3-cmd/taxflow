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
import type { ProductionHistoryItem } from "@/lib/production-service";

interface ProductionRegisterProps {
    records: ProductionHistoryItem[];
}

export function ProductionRegister({ records }: ProductionRegisterProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base font-semibold">Production Register</CardTitle>
            </CardHeader>
            <CardContent>
                {records.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-sm font-medium">No production recorded yet.</p>
                        <p className="mt-1 text-sm text-muted-foreground">Record a production run to see its batch and inventory trace here.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Product ID</TableHead>
                                    <TableHead>Batch ID</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Unit Price</TableHead>
                                    <TableHead className="text-right">Total Value</TableHead>
                                    <TableHead className="text-right">Potential Tax</TableHead>
                                    <TableHead>Production check</TableHead>
                                    <TableHead>Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {records.map((record) => (
                                    <TableRow key={record.id}>
                                        <TableCell className="min-w-32 font-medium">{record.productName}</TableCell>
                                        <TableCell className="whitespace-nowrap font-mono text-xs">{record.productId}</TableCell>
                                        <TableCell className="whitespace-nowrap font-mono text-xs">{record.batchReference}</TableCell>
                                        <TableCell className="text-right font-mono">{record.quantity.toLocaleString()} {record.unit}</TableCell>
                                        <TableCell className="text-right font-mono">{formatRWF(record.unitPrice)}</TableCell>
                                        <TableCell className="text-right font-mono font-medium">{formatRWF(record.totalValue)}</TableCell>
                                        <TableCell className="text-right font-mono text-emerald-600">{formatRWF(record.potentialTax)}</TableCell>
                                        <TableCell className="whitespace-nowrap text-sm">
                                            <div>{record.productionValidationStatus === "review_required" ? <span className="text-amber-700">Review required</span> : record.productionValidationStatus === "within_tolerance" ? <span className="text-emerald-700">Within tolerance</span> : <span className="text-muted-foreground">No recipe evidence</span>}</div>
                                            {record.materialReviewStatus === "pending" && <div className="text-xs text-amber-700">Held for independent release review</div>}
                                            {record.materialShortageCount > 0 && <div className="text-xs text-destructive">{record.materialShortageCount} material shortage{record.materialShortageCount === 1 ? "" : "s"} against verified stock</div>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                            {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.createdAt))}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
