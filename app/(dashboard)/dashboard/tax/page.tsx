import { requireTraderSession } from "@/lib/auth-guard";
import { getBusinessVAT } from "@/lib/actions/vat.action";
import { StatCard, formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, ArrowUpRight, ArrowDownLeft, Calculator } from "lucide-react";
import { ExportPDFButton } from "@/components/dashboard/export-pdf-button/export-pdf-button";

export default async function TaxPage() {
    const session = await requireTraderSession();
    const vat = await getBusinessVAT();

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Tax & VAT
                    </h1>
                    <p className="text-muted-foreground">
                        Your VAT obligations and tax summary.
                    </p>
                </div>
                <ExportPDFButton />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="VAT Output"
                    value={formatRWF(vat.vatOutput)}
                    description="Tax collected on your sales"
                    icon={<ArrowUpRight className="h-4 w-4" />}
                />
                <StatCard
                    title="VAT Input"
                    value={formatRWF(vat.vatInput)}
                    description="Tax paid on your purchases"
                    icon={<ArrowDownLeft className="h-4 w-4" />}
                />
                <StatCard
                    title="Net VAT Due"
                    value={formatRWF(vat.netVatDue)}
                    description="Amount owed to RRA"
                    icon={<Calculator className="h-4 w-4" />}
                    trend={
                        vat.netVatDue > 0
                            ? { value: "Payable", positive: false }
                            : vat.netVatDue < 0
                                ? { value: "Credit", positive: true }
                                : undefined
                    }
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Receipt className="h-4 w-4" />
                        VAT Calculation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                                Total VAT Output (sales)
                            </span>
                            <span className="font-mono font-medium">
                                {formatRWF(vat.vatOutput)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                                Total VAT Input (purchases)
                            </span>
                            <span className="font-mono font-medium text-emerald-600">
                                − {formatRWF(vat.vatInput)}
                            </span>
                        </div>
                        <div className="border-t pt-3 flex justify-between">
                            <span className="font-semibold">
                                Net VAT Due to RRA
                            </span>
                            <span className="font-mono font-bold text-lg">
                                {formatRWF(vat.netVatDue)}
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        VAT is calculated at 18% on all confirmed transactions.
                        This summary reflects your current obligations based on
                        finalized transactions only.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
