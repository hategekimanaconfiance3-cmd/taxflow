'use server';

import {
  assignMessageConversation,
  listRRAConversations,
  replyToConversation,
  resolveMessageConversation,
} from '@/lib/actions/messaging.action';
import { requireRRAPermission } from '@/lib/auth-guard';

/** Compatibility wrapper for old clients. The returned cases are already permission-scoped. */
export async function getAllTickets(status?: string) {
  const rows = await listRRAConversations({ status: status ?? 'all' });
  return rows.filter((row) => row.threadType === 'taxpayer' && row.traderId !== null).map((row) => ({
    id: row.id,
    traderName: row.traderName,
    traderId: row.traderId as string,
    category: row.category,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt,
    resolvedAt: null,
  }));
}

export async function assignTicket(ticketId: string, staffUserId: string): Promise<{ success: true }> {
  return assignMessageConversation({
    ticketId,
    staffUserId,
    reason: 'Assignment submitted through the legacy support interface.',
  });
}

export async function resolveTicket(ticketId: string, resolution: string): Promise<{ success: true }> {
  return resolveMessageConversation({ ticketId, resolution });
}

export async function getTicketStats() {
  const rows = await listRRAConversations({});
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'open' || row.status === 'awaiting_staff').length,
    inProgress: rows.filter((row) => row.status === 'in_progress').length,
    resolved: rows.filter((row) => row.status === 'resolved').length,
    closed: rows.filter((row) => row.status === 'closed').length,
  };
}

export async function getTicketDetail(_ticketId: string): Promise<never> {
  await requireRRAPermission('communications.staff.use');
  throw new Error('This support view has moved. Open the authorized Messages inbox.');
}

export async function reopenTicket(_ticketId: string): Promise<{ success: true }> {
  await requireRRAPermission('support.manage');
  throw new Error('Reopen this conversation from the authorized Messages inbox.');
}

export async function replyToTicket(ticketId: string, message: string): Promise<{ success: true }> {
  return replyToConversation({ ticketId, body: message, clientMessageId: crypto.randomUUID() });
}

export async function getStaffList(): Promise<never[]> {
  await requireRRAPermission('support.manage');
  return [];
}
