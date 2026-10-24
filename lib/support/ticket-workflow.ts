export const SUPPORT_TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_for_trader",
  "waiting_for_internal_team",
  "resolved",
  "closed",
  "reopened",
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_RESOLUTION_CATEGORIES = [
  "technical_issue",
  "transaction_issue",
  "tax_clarification",
  "account_issue",
  "data_correction",
  "compliance_issue",
  "other",
] as const;

export type SupportResolutionCategory = (typeof SUPPORT_RESOLUTION_CATEGORIES)[number];

const ALLOWED_TRANSITIONS: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  open: ["in_progress"],
  in_progress: ["waiting_for_trader", "waiting_for_internal_team", "resolved"],
  waiting_for_trader: ["in_progress"],
  waiting_for_internal_team: ["in_progress"],
  resolved: ["closed", "reopened"],
  closed: [],
  reopened: ["in_progress"],
};

export function canTransitionSupportTicket(
  from: SupportTicketStatus,
  to: SupportTicketStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isSupportTicketStatus(value: string): value is SupportTicketStatus {
  return (SUPPORT_TICKET_STATUSES as readonly string[]).includes(value);
}
