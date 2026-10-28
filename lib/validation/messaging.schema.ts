import { z } from 'zod';
import { MESSAGE_CATEGORIES } from '@/lib/messaging/routing';

const messageBody = z.string().trim().min(1, 'Write a message before sending.').max(10_000);

export const createUserConversationSchema = z.object({
  category: z.enum(MESSAGE_CATEGORIES).optional(),
  subject: z.string().trim().min(1).max(200),
  body: messageBody,
  clientMessageId: z.string().uuid(),
});

export const createStaffConversationSchema = z.object({
  recipientUserIds: z.array(z.string().min(1).max(128)).min(1).max(20),
  subject: z.string().trim().min(1).max(200),
  body: messageBody,
  clientMessageId: z.string().uuid(),
}).refine((input) => new Set(input.recipientUserIds).size === input.recipientUserIds.length, {
  message: 'Choose each staff recipient only once.',
  path: ['recipientUserIds'],
});

export const createStaffTaxpayerConversationSchema = z.object({
  recipientUserId: z.string().min(1).max(128),
  category: z.enum(MESSAGE_CATEGORIES),
  subject: z.string().trim().min(1).max(200),
  body: messageBody,
  clientMessageId: z.string().uuid(),
});

export const replyToConversationSchema = z.object({
  ticketId: z.string().uuid(),
  body: messageBody,
  clientMessageId: z.string().uuid(),
});

export const conversationFilterSchema = z.object({
  status: z.enum(['all', 'open', 'in_progress', 'awaiting_user', 'awaiting_staff', 'resolved', 'closed']).default('all'),
  search: z.string().trim().max(120).default(''),
  before: z.string().datetime().optional(),
});

export const assignConversationSchema = z.object({
  ticketId: z.string().uuid(),
  staffUserId: z.string().min(1).max(128),
  reason: z.string().trim().min(3).max(500),
});

export const resolveConversationSchema = z.object({
  ticketId: z.string().uuid(),
  resolution: z.string().trim().min(3).max(2_000),
});

export const correctRoutingSchema = z.object({
  ticketId: z.string().uuid(),
  category: z.enum(MESSAGE_CATEGORIES),
  reason: z.string().trim().min(5).max(500),
});

export const messagePageSchema = z.object({
  ticketId: z.string().uuid(),
  before: z.string().datetime().optional(),
});

export const conversationIdSchema = z.string().uuid();
export const recipientSearchSchema = z.string().trim().min(2).max(100);

export const routingConfigSchema = z.array(z.object({
  category: z.enum(MESSAGE_CATEGORIES),
  department: z.string().trim().max(100).nullable(),
  roles: z.array(z.string().min(1).max(64)).min(1).max(12),
})).length(MESSAGE_CATEGORIES.length).refine(
  (rules) => new Set(rules.map((rule) => rule.category)).size === MESSAGE_CATEGORIES.length,
  { message: 'Each message category must have exactly one routing rule.' },
);

export type CreateUserConversationInput = z.infer<typeof createUserConversationSchema>;
export type CreateStaffConversationInput = z.infer<typeof createStaffConversationSchema>;
export type CreateStaffTaxpayerConversationInput = z.infer<typeof createStaffTaxpayerConversationSchema>;
