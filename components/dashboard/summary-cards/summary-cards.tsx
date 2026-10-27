import { StatCard, formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
    Factory,
    TrendingUp,
    Package,
    Banknote,
    Receipt,
    CreditCard,
    Calculator,
} from "lucide-react";

interface SummaryCardsProps {
    stats: {
        totalProduced: number;
        totalSold: number;
        remainingStock: number;
        totalSalesValue: number;
        taxGenerated: number;
        taxPaid: number;
        taxBalance: number;
    };
}

/**
 * Format large unit counts compactly (e.g., 17K, 2.9K).
 */
function formatUnits(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export function SummaryCards({ stats }: SummaryCardsProps) {
    return (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
            <StatCard
                title="Total Produced"
                value={formatUnits(stats.totalProduced)}
                description="Units"
                icon={<Factory className="h-4 w-4" />}
                className="border-blue-200 bg-blue-50/30"
            />
            <StatCard
                title="Total Sold"
                value={formatUnits(stats.totalSold)}
                description="Units"
                icon={<TrendingUp className="h-4 w-4" />}
                className="border-emerald-200 bg-emerald-50/30"
            />
            <StatCard
                title="Remaining Stock"
                value={formatUnits(stats.remainingStock)}
                description="Units"
                icon={<Package className="h-4 w-4" />}
                className="border-amber-200 bg-amber-50/30"
            />
            <StatCard
                title="Sales Value"
                value={formatRWF(stats.totalSalesValue)}
                icon={<Banknote className="h-4 w-4" />}
                className="border-violet-200 bg-violet-50/30"
            />
            <StatCard
                title="Tax Generated"
                value={formatRWF(stats.taxGenerated)}
                description="VAT Output"
                icon={<Receipt className="h-4 w-4" />}
                className="border-sky-200 bg-sky-50/30"
            />
            <StatCard
                title="Tax Paid"
                value={formatRWF(stats.taxPaid)}
                description="VAT Input"
                icon={<CreditCard className="h-4 w-4" />}
                className="border-teal-200 bg-teal-50/30"
            />
            <StatCard
                title="Tax Balance"
                value={formatRWF(stats.taxBalance)}
                description="Net Due"
                icon={<Calculator className="h-4 w-4" />}
                className="border-rose-200 bg-rose-50/30"
            />
        </div>
    );
}
