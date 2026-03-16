import { requireTraderSession } from "@/lib/auth-guard";
import { getProducts } from "@/lib/actions/stock.action";
import { getImportDeclarations } from "@/lib/actions/import.action";
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
import { Ship, Package, AlertTriangle, Clock, CheckCircle, XCircle } from "lucide-react";
import { ImportForm } from "@/components/dashboard/import-form/import-form";
import { SubmitArrivalButton } from "@/components/dashboard/import-form/confirm-arrival-button";

export default async function ImportsPage() {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);
    const [products, declarations] = await Promise.all([
        getProducts(),
        getImportDeclarations(),
    ]);

    const pending = declarations.filter((d) => d.status === "pending").length;
    const submitted = declarations.filter((d) => d.status === "submitted").length;
    const activated = declarations.filter((d) => d.status === "activated").length;

    const statusColors: Record<string, string> = {
        pending: "bg-amber-500/10 text-amber-600",
        submitted: "bg-blue-500/10 text-blue-600",
        activated: "bg-emerald-500/10 text-emerald-600",
        rejected: "bg-red-500/10 text-red-600",
    };

    const statusIcons: Record<string, React.ReactNode> = {
        pending: <Clock className="h-3 w-3" />,
        submitted: <Ship className="h-3 w-3" />,
        activated: <CheckCircle className="h-3 w-3" />,
        rejected: <XCircle className="h-3 w-3" />,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Import Management
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Declare imports, submit arrival details with supporting
                    documents, and wait for RRA confirmation.
                </p>
            </div>

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-blue-500">
                                <Ship className="h-4.5 w-4.5" />
                            </div>
                            <div>
                                <p className="text-[12px] font-medium text-muted-foreground">
                                    Total
                                </p>
                                <p className="text-lg font-bold tracking-tight">
                                    {declarations.length}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-amber-500">
                                <Clock className="h-4.5 w-4.5" />
                            </div>
                            <div>
                                <p className="text-[12px] font-medium text-muted-foreground">
                                    Pending
                                </p>
                                <p className="text-lg font-bold tracking-tight">
                                    {pending}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-blue-500">
                                <Ship className="h-4.5 w-4.5" />
                            </div>
                            <div>
                                <p className="text-[12px] font-medium text-muted-foreground">
                                    Awaiting RRA
                                </p>
                                <p className="text-lg font-bold tracking-tight">
                                    {submitted}
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
                                    Activated
                                </p>
                                <p className="text-lg font-bold tracking-tight">
                                    {activated}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Declare Import Form */}
            <ImportForm
                products={products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    unit: p.unit,
                }))}
            />

            {/* Import History */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Import History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {declarations.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No import declarations yet.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Expected</TableHead>
                                    <TableHead>Actual</TableHead>
                                    <TableHead>Origin</TableHead>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {declarations.map((d) => {
                                    const discrepancy =
                                        d.actualQuantity != null
                                            ? d.expectedQuantity -
                                            d.actualQuantity
                                            : null;
                                    const hasDiscrepancy =
                                        discrepancy != null &&
                                        Math.abs(discrepancy) /
                                        d.expectedQuantity >
                                        0.1;

                                    return (
                                        <TableRow key={d.id}>
                                            <TableCell className="font-medium">
                                                {d.productName}
                                                <span className="text-muted-foreground text-xs ml-1">
                                                    ({d.productUnit})
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-mono">
                                                {d.expectedQuantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="font-mono">
                                                <div className="flex items-center gap-1">
                                                    {d.actualQuantity != null
                                                        ? d.actualQuantity.toLocaleString()
                                                        : "—"}
                                                    {hasDiscrepancy && (
                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {d.originCountry || "—"}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">
                                                {d.invoiceRef || d.customsRef || "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={`gap-1 ${statusColors[d.status] || ""}`}
                                                >
                                                    {statusIcons[d.status]}
                                                    {d.status === "submitted" ? "awaiting RRA" : d.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(
                                                    d.createdAt,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {d.status === "pending" && (
                                                    <SubmitArrivalButton
                                                        declarationId={d.id}
                                                        productName={
                                                            d.productName
                                                        }
                                                        expectedQuantity={
                                                            d.expectedQuantity
                                                        }
                                                    />
                                                )}
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
