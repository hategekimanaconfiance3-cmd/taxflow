import { notFound } from "next/navigation";
import { getAdminSupportTicketDetail } from "@/lib/actions/admin-support-ticket.action";
import { AdminSupportTicketDetail } from "@/components/admin/support-ticket-detail";

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const detail = await getAdminSupportTicketDetail(ticketId);
  if (!detail) notFound();
  return <AdminSupportTicketDetail detail={detail} />;
}
