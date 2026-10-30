import { requireRRASession } from "@/lib/auth-guard";
import { getAllTickets, getStaffList } from "@/lib/actions/admin-support-ticket.action";
import SupportTicketPanel from "@/components/admin/support-ticket-panel";

export const dynamic = "force-dynamic";

/**
 * Roles that can mutate tickets (assign / reply / resolve / reopen).
 * Must match the allowlist inside admin-support-ticket.action.ts.
 */
const MANAGE_ROLES = ["compliance_officer", "tax_compliance_officer"] as const;

export default async function AdminSupportPage() {
    const { staff } = await requireRRASession(
        "compliance_officer",
        "audit_officer",
        "tax_compliance_officer",
        "audit_investigation_officer",
    );

    const [tickets, staffList] = await Promise.all([
        getAllTickets(),
        getStaffList(),
    ]);

    // Use clearanceRoles (validated array), not clearanceLevel (single raw DB string).
    const canManage = staff.clearanceRoles.some((role) =>
        (MANAGE_ROLES as readonly string[]).includes(role),
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Review, assign, reply to, and resolve trader-submitted support requests.
                </p>
            </div>

            <SupportTicketPanel tickets={tickets} staffList={staffList} canManage={canManage} />
        </div>
    );
}
