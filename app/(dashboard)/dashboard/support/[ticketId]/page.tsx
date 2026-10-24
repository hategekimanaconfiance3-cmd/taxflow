import { notFound } from "next/navigation";
import { requireTraderSession } from "@/lib/auth-guard";
import { getMySupportTicket } from "@/lib/actions/support-ticket.action";
import { TraderSupportTicketDetail } from "@/components/dashboard/support-ticket-detail";

export default async function TraderSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await requireTraderSession();
  const { ticketId } = await params;
  const detail = await getMySupportTicket(ticketId);
  if (!detail) notFound();
  return <TraderSupportTicketDetail detail={detail} />;
}
