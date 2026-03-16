import { requireRRASession } from "@/lib/auth-guard";
import { getSystemVAT } from "@/lib/actions/vat.action";
import { getComplianceReport } from "@/lib/actions/admin.action";
import { StatCard, formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, TrendingUp, TrendingDown, Calculator } from "lucide-react";

export default async function AdminTaxPage() {
    await requireRRASession("compliance_officer", "reporting_officer");

    const [systemVat, compliance] = await Promise.all([
        getSystemVAT(),
        getComplianceReport(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Tax & VAT Overview
                </h1>
                <p className="text-muted-foreground">
                    System-wide VAT collection and compliance.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total VAT Output"
                    value={formatRWF(systemVat.totalVatGenerated)}
                    description="Collected from all sales"
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <StatCard
                    title="Total VAT Input"
                    value={formatRWF(systemVat.totalVatPaid)}
                    description="Claimed by buyers"
                    icon={<TrendingDown className="h-4 w-4" />}
                />
                <StatCard
                    title="Net VAT Due"
                    value={formatRWF(systemVat.netVatDue)}
                    description="System balance"
                    icon={<Calculator className="h-4 w-4" />}
                />
                <StatCard
                    title="Total Businesses"
                    value={systemVat.totalBusinesses}
                    description="Active in supply chain"
                    icon={<Receipt className="h-4 w-4" />}
                />
            </div>

            {/* Transaction stats */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Transaction Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {compliance.transactionStats.map((stat) => (
                            <div
                                key={stat.status}
                                className="flex justify-between items-center rounded-lg border p-3"
                            >
                                <div>
                                    <p className="font-medium capitalize text-sm">
                                        {stat.status}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {stat.count} transactions
                                    </p>
                                </div>
                                <p className="font-mono font-semibold">
                                    {formatRWF(stat.totalValue)}
                                </p>
                            </div>
                        ))}
                        {compliance.transactionStats.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No transactions recorded yet.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* VAT by type */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        VAT Records Summary
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {compliance.vatStats.map((stat) => (
                            <div
                                key={stat.vatType}
                                className="flex justify-between items-center rounded-lg border p-3"
                            >
                                <p className="font-medium capitalize text-sm">
                                    VAT {stat.vatType}
                                </p>
                                <p className="font-mono font-semibold">
                                    {formatRWF(stat.total)}
                                </p>
                            </div>
                        ))}
                        {compliance.vatStats.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No VAT records yet.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
