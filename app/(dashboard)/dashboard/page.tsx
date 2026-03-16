import { requireApprovedClearance } from "@/lib/auth-guard";
import { getDashboardStats, getMonthlyStats } from "@/lib/actions/dashboard.action";
import { getIncomingTransactions } from "@/lib/actions/transaction.action";
import { SummaryCards } from "@/components/dashboard/summary-cards/summary-cards";
import { PendingConfirmations } from "@/components/dashboard/pending-table/pending-table";
import { ProductionChart } from "@/components/dashboard/production-chart/production-chart";
import { SalesChart } from "@/components/dashboard/sales-chart/sales-chart";
import { StockPie } from "@/components/dashboard/stock-pie/stock-pie";
import { ROLE_LABELS, type TraderRole } from "@/lib/sidebar-config";
import { AlertTriangle } from "lucide-react";

export default async function DashboardOverview() {
    const { suspended, clearanceStatus, ...session } =
        await requireApprovedClearance();
    const role = session.user.role as TraderRole;

    const [stats, incoming, monthly] = await Promise.all([
        getDashboardStats(),
        getIncomingTransactions(),
        getMonthlyStats(),
    ]);

    const pendingIncoming = incoming.filter((t) => t.status === "pending");

    return (
        <div className="space-y-6">
            {/* Suspended banner */}
            {suspended && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-medium">
                            Account {clearanceStatus.replace("_", " ")}
                        </p>
                        <p className="text-sm">
                            Your account is currently under review by RRA.
                            Transactions are temporarily disabled.
                        </p>
                    </div>
                </div>
            )}

            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground">
                    Welcome back. Here&apos;s your{" "}
                    {ROLE_LABELS[role].toLowerCase()} overview.
                </p>
            </div>

            {/* 7 Summary Cards */}
            <SummaryCards stats={stats} />

            {/* Pending confirmations */}
            {pendingIncoming.length > 0 && (
                <PendingConfirmations transactions={pendingIncoming} />
            )}

            {/* Charts section — 2 columns on md, 3 on lg */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ProductionChart data={monthly.monthlyProduction} />
                <SalesChart data={monthly.monthlySales} />
                <StockPie
                    produced={stats.totalProduced}
                    sold={stats.totalSold}
                    remaining={stats.remainingStock}
                />
            </div>
        </div>
    );
}
