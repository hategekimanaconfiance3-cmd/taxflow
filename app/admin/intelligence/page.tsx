import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { IntelligenceChat } from "@/components/admin/intelligence-chat";
import { RevenueForecastChart } from "@/components/admin/revenue-forecast-chart";

// ---------------------------------------------------------------------------
// /admin/intelligence — AI-powered query interface for RRA officers
// ---------------------------------------------------------------------------

export default async function IntelligencePage() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        redirect("/admin-login");
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    AI Intelligence Center
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Query traders, transactions, risk scores, and revenue data using natural language
                </p>
            </div>

            {/* Layout: Chat + Forecast side panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <IntelligenceChat />
                </div>
                <div>
                    <RevenueForecastChart />
                </div>
            </div>
        </div>
    );
}
