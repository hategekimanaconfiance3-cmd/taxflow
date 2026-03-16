import { requireRRASession } from "@/lib/auth-guard";
import { getAllImportDeclarations } from "@/lib/actions/import.action";
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
import { Ship, Package, AlertTriangle, FileText } from "lucide-react";
import { AdminImportActions } from "@/components/admin/admin-import-actions";

export default async function AdminImportsPage() {
    await requireRRASession("compliance_officer", "audit_officer");
    const declarations = await getAllImportDeclarations();

    const submitted = declarations.filter((d) => d.status === "submitted").length;
    const activated = declarations.filter((d) => d.status === "activated").length;

    const statusColors: Record<string, string> = {
        pending: "bg-amber-500/10 text-amber-600",
        submitted: "bg-blue-500/10 text-blue-600",
        activated: "bg-emerald-500/10 text-emerald-600",
        rejected: "bg-red-500/10 text-red-600",
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Import Declarations Review
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Review trader submissions and confirm or reject import arrivals.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="text-sm gap-1">
                        <Ship className="h-3.5 w-3.5" />
                        {submitted} awaiting review
                    </Badge>
                    <Badge variant="outline" className="text-sm gap-1 text-emerald-600">
                        {activated} activated
                    </Badge>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        All Import Declarations
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {declarations.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No import declarations.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Business</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Expected</TableHead>
                                    <TableHead>Actual</TableHead>
                                    <TableHead>Invoice Ref</TableHead>
                                    <TableHead>Supporting Docs</TableHead>
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
                                            ? d.expectedQuantity - d.actualQuantity
                                            : null;
                                    const hasDiscrepancy =
                                        discrepancy != null &&
                                        Math.abs(discrepancy) / d.expectedQuantity > 0.1;

                                    return (
                                        <TableRow key={d.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium text-sm">
                                                        {d.businessName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        {d.tinNumber}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {d.productName}
                                                <span className="text-muted-foreground text-xs ml-1">
                                                    ({d.productUnit})
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {d.expectedQuantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                <div className="flex items-center gap-1">
                                                    {d.actualQuantity != null
                                                        ? d.actualQuantity.toLocaleString()
                                                        : "—"}
                                                    {hasDiscrepancy && (
                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {d.invoiceRef ? (
                                                    <span className="font-mono text-xs">
                                                        {d.invoiceRef}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-[150px]">
                                                {d.supportingDoc ? (
                                                    d.supportingDoc.startsWith("/uploads") ? (
                                                        <a
                                                            href={d.supportingDoc}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                        >
                                                            <FileText className="h-3.5 w-3.5" />
                                                            View Invoice PDF
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-start gap-1">
                                                            <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                                            <span className="text-xs text-muted-foreground truncate">
                                                                {d.supportingDoc}
                                                            </span>
                                                        </div>
                                                    )
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={statusColors[d.status] || ""}
                                                >
                                                    {d.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(d.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {d.status === "submitted" && (
                                                    <AdminImportActions
                                                        declarationId={d.id}
                                                        productName={d.productName}
                                                        expectedQuantity={d.expectedQuantity}
                                                        actualQuantity={d.actualQuantity || 0}
                                                        invoiceRef={d.invoiceRef || ""}
                                                        supportingDoc={d.supportingDoc || ""}
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
