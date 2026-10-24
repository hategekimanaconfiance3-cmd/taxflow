import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionSupportTicket, isSupportTicketStatus } from "@/lib/support/ticket-workflow";
import { isSupportTicketInStaffScope } from "@/lib/support/ticket-access";
import {
  supportAiRequestSchema,
  ticketAssignmentSchema,
  ticketEscalationSchema,
  ticketInternalNoteSchema,
  ticketMessageSchema,
  ticketResolutionSchema,
  traderTicketConfirmationSchema,
} from "@/lib/validation/support-ticket";
import { hasRRAPermission } from "@/lib/rra-rbac";

test("support ticket workflow allows each documented forward transition", () => {
  const allowed = [
    ["open", "in_progress"],
    ["in_progress", "waiting_for_trader"],
    ["in_progress", "waiting_for_internal_team"],
    ["in_progress", "resolved"],
    ["waiting_for_trader", "in_progress"],
    ["waiting_for_internal_team", "in_progress"],
    ["resolved", "closed"],
    ["resolved", "reopened"],
    ["reopened", "in_progress"],
  ] as const;

  for (const [from, to] of allowed) {
    assert.equal(canTransitionSupportTicket(from, to), true, `${from} -> ${to} should be allowed`);
  }
});

test("support ticket workflow rejects skipped and terminal transitions", () => {
  const rejected = [
    ["open", "closed"],
    ["open", "resolved"],
    ["waiting_for_trader", "resolved"],
    ["waiting_for_internal_team", "closed"],
    ["resolved", "in_progress"],
    ["closed", "reopened"],
  ] as const;

  for (const [from, to] of rejected) {
    assert.equal(canTransitionSupportTicket(from, to), false, `${from} -> ${to} should be rejected`);
  }
  assert.equal(isSupportTicketStatus("closed"), true);
  assert.equal(isSupportTicketStatus("pending"), false);
});

test("support mutation schemas reject empty or invalid external data", () => {
  assert.equal(ticketMessageSchema.safeParse({ ticketId: "ticket-1", body: " " }).success, false);
  assert.equal(ticketInternalNoteSchema.safeParse({ ticketId: "ticket-1", body: "valid note", category: "x".repeat(81) }).success, false);
  assert.equal(ticketAssignmentSchema.safeParse({ ticketId: "ticket-1", assignedToUserId: "" }).success, false);
  assert.equal(ticketEscalationSchema.safeParse({ ticketId: "ticket-1", department: "Compliance", reason: " " }).success, false);
  assert.equal(ticketResolutionSchema.safeParse({ ticketId: "ticket-1", summary: "too short", category: "other" }).success, false);
  assert.equal(ticketResolutionSchema.safeParse({ ticketId: "ticket-1", summary: "A valid resolution summary", category: "unapproved" }).success, false);
  assert.equal(traderTicketConfirmationSchema.safeParse({ ticketId: "ticket-1", resolved: "yes" }).success, false);
  assert.equal(supportAiRequestSchema.safeParse({ ticketId: "ticket-1", mode: "close_ticket" }).success, false);
});

test("support permissions separate staff handling from supervisor assignment", () => {
  assert.equal(hasRRAPermission("audit_officer", "support.manage"), true);
  assert.equal(hasRRAPermission("compliance_officer", "support.assign"), true);
  assert.equal(hasRRAPermission("super_admin", "support.escalate"), true);
  assert.equal(hasRRAPermission("stock_officer", "support.manage"), false);
  assert.equal(hasRRAPermission("audit_officer", "support.assign"), false);
});

test("staff ticket visibility respects assignment, department, and unassigned intake scope", () => {
  const officerRoles = ["audit_officer"];
  assert.equal(isSupportTicketInStaffScope({ assignedToId: null, assignedDepartment: null, status: "open" }, "officer-1", "Audit", officerRoles), true);
  assert.equal(isSupportTicketInStaffScope({ assignedToId: "officer-1", assignedDepartment: "Audit", status: "in_progress" }, "officer-1", "Audit", officerRoles), true);
  assert.equal(isSupportTicketInStaffScope({ assignedToId: "officer-2", assignedDepartment: "Audit", status: "in_progress" }, "officer-1", "Audit", officerRoles), true);
  assert.equal(isSupportTicketInStaffScope({ assignedToId: "officer-2", assignedDepartment: "Compliance", status: "in_progress" }, "officer-1", "Audit", officerRoles), false);
  assert.equal(isSupportTicketInStaffScope({ assignedToId: null, assignedDepartment: null, status: "closed" }, "officer-1", "Audit", officerRoles), false);
});

test("support supervisors can access tickets across department scope", () => {
  assert.equal(isSupportTicketInStaffScope(
    { assignedToId: "officer-2", assignedDepartment: "Compliance", status: "in_progress" },
    "officer-1",
    "Audit",
    ["super_admin"],
  ), true);
});
