import { requireRRASession } from "@/lib/auth-guard";
import { AdminShell } from "@/components/admin/admin-shell/admin-shell";
import { AIChatWidget } from "@/components/shared/ai-chat-widget";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, staff } = await requireRRASession();

    return (
        <AdminShell
            userName={user.name}
            staffId={staff.staffId}
            clearanceLevel={staff.clearanceLevel}
        >
            {children}
            <AIChatWidget role="rra_staff" />
        </AdminShell>
    );
}
