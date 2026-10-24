import { z } from "zod";
import { SUPPORT_RESOLUTION_CATEGORIES } from "@/lib/support/ticket-workflow";

const ticketId = z.string().trim().min(1).max(128);
const messageBody = z.string().trim().min(2, "Enter a message.").max(5_000, "Messages must be 5,000 characters or fewer.");

export const ticketIdSchema = ticketId;

export const ticketCreateSchema = z.object({
  category: z.enum(["general", "tax_query", "account_issue", "system_bug", "other"]),
  subject: z.string().trim().min(1, "Subject is required.").max(200, "Subject must be 200 characters or fewer."),
  description: z.string().trim().min(1, "Description is required.").max(10_000, "Description must be 10,000 characters or fewer."),
});

export const ticketMessageSchema = z.object({ ticketId, body: messageBody });

export const ticketInternalNoteSchema = z.object({
  ticketId,
  body: messageBody,
  category: z.string().trim().max(80).optional(),
});

export const ticketAssignmentSchema = z.object({
  ticketId,
  assignedToUserId: z.string().trim().min(1).max(128),
});

export const ticketEscalationSchema = z.object({
  ticketId,
  department: z.string().trim().min(1).max(120),
  assignedToUserId: z.string().trim().max(128).optional(),
  reason: messageBody,
});

export const ticketResolutionSchema = z.object({
  ticketId,
  summary: z.string().trim().min(10, "Provide a resolution summary.").max(5_000),
  category: z.enum(SUPPORT_RESOLUTION_CATEGORIES),
});

export const traderTicketConfirmationSchema = z.object({
  ticketId,
  resolved: z.boolean(),
  reason: z.string().trim().max(2_000).optional(),
});

export const supportAiRequestSchema = z.object({
  ticketId,
  mode: z.enum(["analyze", "draft_reply", "draft_resolution"]),
  question: z.string().trim().max(1_000).optional(),
});
