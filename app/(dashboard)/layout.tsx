import { requireTraderSession } from "@/lib/auth-guard";
import { DashboardSidebar } from "@/components/dashboard/sidebar/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar/topbar";
import { SocketProvider } from "@/components/providers/socket-provider";
import { AIChatWidget } from "@/components/shared/ai-chat-widget";
import type { TraderRole } from "@/lib/sidebar-config";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requireTraderSession();
    const role = (session.user.role ?? "manufacturer") as TraderRole;
    const userName = session.user.name ?? "User";
    const userId = session.user.id;
    const businessName =
        (session.user as Record<string, unknown>).businessName as string ??
        "Business";

    return (
        <div className="min-h-screen bg-background">
            <SocketProvider userId={userId}>
                <DashboardSidebar
                    role={role}
                    businessName={businessName}
                    userName={userName}
                />
                <DashboardTopbar
                    role={role}
                    userName={userName}
                    businessName={businessName}
                    userId={userId}
                />
                <main className="lg:pl-[260px] pt-0">
                    <div className="p-6">{children}</div>
                </main>
                <AIChatWidget role={role} />
            </SocketProvider>
        </div>
    );
}

