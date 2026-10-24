import { hasRRAPermission, isRRARole } from "@/lib/rra-rbac";

export type SupportTicketScopeFields = {
  assignedToId: string | null;
  assignedDepartment: string | null;
  status: string;
};

export function canManageAllSupportTickets(roles: readonly string[]): boolean {
  return roles.some((role) => isRRARole(role) && hasRRAPermission(role, "support.assign"));
}

/**
 * Supervisors may see the full queue. Other support staff may see their own
 * assignments, their department queue, and unassigned intake tickets.
 */
export function isSupportTicketInStaffScope(
  ticket: SupportTicketScopeFields,
  actorId: string,
  department: string | null,
  roles: readonly string[],
): boolean {
  if (canManageAllSupportTickets(roles)) return true;
  return ticket.assignedToId === actorId
    || Boolean(department && ticket.assignedDepartment === department)
    || (!ticket.assignedToId && (ticket.status === "open" || ticket.status === "reopened"));
}
