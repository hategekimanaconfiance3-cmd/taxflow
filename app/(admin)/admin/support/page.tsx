import { requireRRASession } from "@/lib/auth-guard";
import { getAllTickets, getStaffList } from "@/lib/actions/admin-support-ticket.action";
import SupportTicketPanel from "@/components/admin/support-ticket-panel";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
    await requireRRASession(
        "compliance_officer",
        "audit_officer",
        "tax_compliance_officer",
        "audit_investigation_officer",
    );

    const [tickets, staffList] = await Promise.all([
        getAllTickets(),
        getStaffList(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Review, assign, reply to, and resolve trader-submitted support requests.
                </p>
            </div>

            <SupportTicketPanel tickets={tickets} staffList={staffList} />
        </div>
    );
}
