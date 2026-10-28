"use server";

import { headers } from 'next/headers';
import { and, desc, eq, gt, ilike, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  auditLog,
  notification,
  rraStaff,
  rraStaffRole,
  supportTicket,
  supportTicketMessage,
  supportTicketParticipant,
  systemConfig,
  user,
} from '@/db/schema';
import { requireRRAPermission, requireSession, requireTraderSession } from '@/lib/auth-guard';
import { hasRRAPermission, isRRARole, type RRARole } from '@/lib/rra-rbac';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { emitToUsers } from '@/lib/realtime';
import {
  DEFAULT_MESSAGING_ROUTES,
  MESSAGE_CATEGORIES,
  canRoleHandleCategory,
  classifyMessage,
  isMessageCategory,
  routeRuleFor,
  type MessageCategory,
  type MessagingRouteRule,
} from '@/lib/messaging/routing';
import {
  assignConversationSchema,
  conversationFilterSchema,
  correctRoutingSchema,
  messagePageSchema,
  createStaffConversationSchema,
  createStaffTaxpayerConversationSchema,
  createUserConversationSchema,
  conversationIdSchema,
  recipientSearchSchema,
  replyToConversationSchema,
  resolveConversationSchema,
  routingConfigSchema,
} from '@/lib/validation/messaging.schema';

const ROUTING_CONFIG_KEY = 'communications.routing.v1';
const GENERIC_NOTIFICATION = 'A new secure TaxFlow message is available.';

type ActorStaff = {
  userId: string;
  staffRecordId: string;
  department: string | null;
  roles: RRARole[];
};

function assertRateLimit(allowed: boolean): void {
  if (!allowed) throw new Error('You are sending messages too quickly. Wait a moment and try again.');
}

async function applyRateLimit(namespace: string, userId: string, maxRequests: number): Promise<void> {
  const requestHeaders = await headers();
  const result = await consumeRateLimit(namespace, `${userId}:${getRequestIdentity(requestHeaders)}`, maxRequests, 60);
  assertRateLimit(result.allowed);
}

function auditEntry(userId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  return {
    userId,
    action,
    targetType: 'support_ticket',
    targetId,
    metadata: JSON.stringify(metadata),
  };
}

async function getMessagingRoutes(): Promise<MessagingRouteRule[]> {
  const [configured] = await db.select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, ROUTING_CONFIG_KEY))
    .limit(1);
  if (!configured) return DEFAULT_MESSAGING_ROUTES;
  try {
    const parsed = routingConfigSchema.safeParse(JSON.parse(configured.value) as unknown);
    if (!parsed.success || parsed.data.some((rule) => rule.roles.some((role) => !isRRARole(role)))) {
      console.error('[messaging] Invalid stored routing configuration; defaults are active.');
      return DEFAULT_MESSAGING_ROUTES;
    }
    return parsed.data.map((rule) => ({
      ...rule,
      roles: rule.roles.filter(isRRARole),
    }));
  } catch (error) {
    console.error('[messaging] Unable to read routing configuration:', error);
    return DEFAULT_MESSAGING_ROUTES;
  }
}

function legacyCategory(value: string): MessageCategory | null {
  if (isMessageCategory(value)) return value;
  if (value === 'tax_query') return 'tax_declaration';
  if (value === 'account_issue') return 'account_access';
  if (value === 'system_bug' || value === 'other') return 'general';
  return null;
}

function resolveCategory(hint: string | undefined, subject: string, body: string): ReturnType<typeof classifyMessage> {
  const hinted = hint ? legacyCategory(hint) : null;
  const classified = classifyMessage(`${hint ?? ''} ${subject}`, body);
  if (classified.category !== 'general' || !hinted) return classified;
  return { ...classified, category: hinted };
}

async function listActiveRRAStaff(): Promise<Array<{
  staffRecordId: string;
  userId: string;
  name: string;
  staffId: string;
  department: string | null;
  clearanceLevel: string;
  roles: RRARole[];
}>> {
  const rows = await db.select({
    staffRecordId: rraStaff.id,
    userId: rraStaff.userId,
    name: user.name,
    staffId: rraStaff.staffId,
    department: rraStaff.department,
    clearanceLevel: rraStaff.clearanceLevel,
  })
    .from(rraStaff)
    .innerJoin(user, eq(user.id, rraStaff.userId))
    .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, 'rra_staff')));
  if (!rows.length) return [];
  const roleRows = await db.select({ staffRecordId: rraStaffRole.staffRecordId, role: rraStaffRole.role })
    .from(rraStaffRole)
    .where(inArray(rraStaffRole.staffRecordId, rows.map((row) => row.staffRecordId)));
  const rolesByStaff = new Map<string, string[]>();
  for (const roleRow of roleRows) {
    const roles = rolesByStaff.get(roleRow.staffRecordId) ?? [];
    roles.push(roleRow.role);
    rolesByStaff.set(roleRow.staffRecordId, roles);
  }
  return rows.map((row) => {
    const roles = rolesByStaff.get(row.staffRecordId);
    return {
      ...row,
      roles: (roles?.length ? roles : [row.clearanceLevel]).filter(isRRARole),
    };
  });
}

async function queueRecipients(
  category: MessageCategory,
  department: string | null,
  rules: readonly MessagingRouteRule[],
): Promise<string[]> {
  const staffList = await listActiveRRAStaff();
  return [...new Set(staffList
    .filter((staff) => (department === null || staff.department?.trim().toLocaleLowerCase() === department.toLocaleLowerCase())
      && staff.roles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, category, rules)))
    .map((staff) => staff.userId))];
}

function staffCanReadCategory(staff: ActorStaff, category: MessageCategory, rules: readonly MessagingRouteRule[]): boolean {
  return staff.roles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, category, rules));
}

async function getTicket(ticketId: string) {
  const [ticket] = await db.select().from(supportTicket).where(eq(supportTicket.id, ticketId)).limit(1);
  if (!ticket) throw new Error('Conversation not found.');
  return ticket;
}

function ticketCategory(ticket: typeof supportTicket.$inferSelect): MessageCategory {
  return legacyCategory(ticket.routingCategory ?? ticket.category) ?? 'general';
}

async function requireCanReadForStaff(ticketId: string, staff: ActorStaff, rules: readonly MessagingRouteRule[]) {
  const ticket = await getTicket(ticketId);
  if (ticket.threadType === 'staff') {
    const [participant] = await db.select({ id: supportTicketParticipant.id })
      .from(supportTicketParticipant)
      .where(and(
        eq(supportTicketParticipant.ticketId, ticketId),
        eq(supportTicketParticipant.userId, staff.userId),
        eq(supportTicketParticipant.participantType, 'staff'),
      ))
      .limit(1);
    if (!participant) throw new Error('Conversation not found.');
    return ticket;
  }
  if (ticket.traderId === null) throw new Error('Conversation not found.');
  if (ticket.assignedToId === staff.userId) {
    const category = ticketCategory(ticket);
    const [staffRecord] = await db.select({ department: rraStaff.department })
      .from(rraStaff)
      .where(and(eq(rraStaff.id, staff.staffRecordId), eq(rraStaff.isActive, true)))
      .limit(1);
    const route = routeRuleFor(category, rules);
    if (staffCanReadCategory(staff, category, rules)
      && (route.department === null || staffRecord?.department?.trim().toLocaleLowerCase() === route.department.toLocaleLowerCase())) {
      return ticket;
    }
    throw new Error('Conversation not found.');
  }
  if (ticket.assignedToId === null) {
    const category = ticketCategory(ticket);
    const [staffRecord] = await db.select({ department: rraStaff.department })
      .from(rraStaff)
      .where(eq(rraStaff.id, staff.staffRecordId))
      .limit(1);
    const route = routeRuleFor(category, rules);
    if (staffCanReadCategory(staff, category, rules)
      && (route.department === null || staffRecord?.department?.trim().toLocaleLowerCase() === route.department.toLocaleLowerCase())) {
      return ticket;
    }
  }
  throw new Error('Conversation not found.');
}

async function upsertParticipant(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ticketId: string,
  userId: string,
  participantType: 'taxpayer' | 'staff' | 'queue',
  lastReadAt: Date | null,
): Promise<void> {
  await tx.insert(supportTicketParticipant).values({
    id: crypto.randomUUID(),
    ticketId,
    userId,
    participantType,
    lastReadAt,
  }).onConflictDoUpdate({
    target: [supportTicketParticipant.ticketId, supportTicketParticipant.userId],
    set: { participantType, lastReadAt, archivedAt: null },
  });
}

async function insertSafeNotifications(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  recipientIds: string[],
  link: string,
  title = 'New TaxFlow message',
): Promise<string[]> {
  const ids = [...new Set(recipientIds)];
  for (const userId of ids) {
    await tx.insert(notification).values({
      id: crypto.randomUUID(),
      userId,
      type: 'message_received',
      title,
      message: GENERIC_NOTIFICATION,
      link,
    });
  }
  return ids;
}

export async function createTaxpayerConversation(input: unknown): Promise<{ success: true; id: string; category: MessageCategory }> {
  const parsed = createUserConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Message details are invalid.');
  const session = await requireTraderSession();
  await applyRateLimit('message-create', session.user.id, 5);
  const { subject, body, clientMessageId } = parsed.data;
  const classified = resolveCategory(parsed.data.category, subject, body);
  const [priorMessage] = await db.select({ ticketId: supportTicketMessage.ticketId })
    .from(supportTicketMessage)
    .where(and(eq(supportTicketMessage.senderUserId, session.user.id), eq(supportTicketMessage.clientMessageId, clientMessageId)))
    .limit(1);
  if (priorMessage) return { success: true, id: priorMessage.ticketId, category: classified.category };
  const rules = await getMessagingRoutes();
  let routingCategory = classified.category;
  let route = routeRuleFor(routingCategory, rules);
  let recipients = await queueRecipients(routingCategory, route.department, rules);
  let routingReason = classified.matchedTerms.length
    ? `Rule matched: ${classified.matchedTerms.join(', ')}`
    : 'No category keywords matched; assigned to the general RRA review queue.';
  if (!recipients.length && routingCategory !== 'general') {
    routingCategory = 'general';
    route = routeRuleFor(routingCategory, rules);
    recipients = await queueRecipients(routingCategory, route.department, rules);
    routingReason = 'No active staff matched the category; routed to the general RRA review queue.';
  }
  if (!recipients.length) {
    throw new Error('No active authorized RRA support queue is available. Please try again later.');
  }

  const notificationUsers: string[] = [];
  try {
    const ticket = await db.transaction(async (tx) => {
      const [created] = await tx.insert(supportTicket).values({
        traderId: session.user.id,
        threadType: 'taxpayer',
        category: classified.category,
        routingCategory,
        routingDepartment: route.department,
        routingReason,
        subject,
        description: body,
        status: 'awaiting_staff',
        priority: classified.priority,
      }).returning({ id: supportTicket.id, createdAt: supportTicket.createdAt });
      if (!created) throw new Error('Conversation could not be created.');
      await tx.insert(supportTicketMessage).values({
        id: crypto.randomUUID(),
        ticketId: created.id,
        authorId: session.user.id,
        senderUserId: session.user.id,
        senderType: 'taxpayer',
        body,
        clientMessageId,
        createdAt: created.createdAt,
      });
      await tx.insert(supportTicketParticipant).values({
        id: crypto.randomUUID(),
        ticketId: created.id,
        userId: session.user.id,
        participantType: 'taxpayer',
        lastReadAt: created.createdAt,
      });
      await tx.insert(auditLog).values(auditEntry(session.user.id, 'MESSAGE_CONVERSATION_CREATED', created.id, {
        threadType: 'taxpayer', category: classified.category, routingCategory, routingDepartment: route.department,
        matchedTerms: classified.matchedTerms, routingReason,
      }));
      const link = `/admin/messages?conversation=${created.id}`;
      notificationUsers.push(...await insertSafeNotifications(tx, recipients, link));
      return created;
    });
    emitToUsers(notificationUsers, 'notification', { type: 'message_received', title: 'New TaxFlow message', link: `/admin/messages?conversation=${ticket.id}` });
    emitToUsers(notificationUsers, 'message', { conversationId: ticket.id });
    return { success: true, id: ticket.id, category: classified.category };
  } catch (error) {
    console.error('[messaging] Could not create taxpayer conversation:', error);
    throw new Error('TaxFlow could not send your message. Please try again.');
  }
}

export async function searchRRAStaff(queryInput: unknown): Promise<Array<{
  userId: string; name: string; staffId: string; department: string | null; role: string;
}>> {
  const session = await requireRRAPermission('communications.staff.use');
  await applyRateLimit('message-staff-search', session.user.id, 30);
  const parsed = recipientSearchSchema.safeParse(queryInput);
  if (!parsed.success) return [];
  const term = parsed.data.slice(0, 80);
  const rows = await db.select({
    userId: rraStaff.userId,
    name: user.name,
    staffId: rraStaff.staffId,
    department: rraStaff.department,
    clearanceLevel: rraStaff.clearanceLevel,
    staffRecordId: rraStaff.id,
  })
    .from(rraStaff)
    .innerJoin(user, eq(user.id, rraStaff.userId))
    .where(and(
      eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, 'rra_staff'),
      or(ilike(user.name, `%${term}%`), ilike(rraStaff.staffId, `%${term}%`), ilike(rraStaff.department, `%${term}%`)),
      ne(rraStaff.userId, session.user.id),
    ))
    .limit(20);
  const activeStaff = await listActiveRRAStaff();
  const permissionedStaff = new Set(activeStaff
    .filter((member) => member.roles.some((role) => hasRRAPermission(role, 'communications.staff.use')))
    .map((member) => member.userId));
  const roleMatches = new Set(activeStaff
    .filter((member) => member.roles.some((role) => role.toLocaleLowerCase().includes(term.toLocaleLowerCase())))
    .map((member) => member.userId));
  const byId = new Map(rows.map((row) => [row.userId, row]));
  for (const member of activeStaff) {
    if (roleMatches.has(member.userId) && !byId.has(member.userId)) {
      byId.set(member.userId, {
        userId: member.userId,
        name: member.name,
        staffId: member.staffId,
        department: member.department,
        clearanceLevel: member.clearanceLevel,
        staffRecordId: member.staffRecordId,
      });
    }
  }
  return [...byId.values()].filter((row) => permissionedStaff.has(row.userId))
    .map(({ userId, name, staffId, department, clearanceLevel }) => ({ userId, name, staffId, department, role: clearanceLevel }));
}

export async function searchTaxpayerRecipients(queryInput: unknown): Promise<Array<{
  userId: string; name: string; businessName: string | null; tin: string | null; role: string;
}>> {
  const session = await requireRRAPermission('taxpayer.intelligence.search');
  if (!session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'support.manage'))) {
    throw new Error('You are not authorized to initiate taxpayer communications.');
  }
  const parsed = recipientSearchSchema.safeParse(queryInput);
  if (!parsed.success) return [];
  const term = parsed.data;
  await applyRateLimit('message-taxpayer-search', session.user.id, 20);
  return db.select({ userId: user.id, name: user.name, businessName: user.businessName, tin: user.tinNumber, role: user.role })
    .from(user)
    .where(and(
      eq(user.isActive, true), ne(user.role, 'rra_staff'),
      or(ilike(user.name, `%${term}%`), ilike(user.businessName, `%${term}%`), ilike(user.tinNumber, `%${term}%`)),
    ))
    .orderBy(user.businessName, user.name)
    .limit(20);
}

export async function startStaffConversation(input: unknown): Promise<{ success: true; id: string }> {
  const parsed = createStaffConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Conversation details are invalid.');
  const session = await requireRRAPermission('communications.staff.use');
  await applyRateLimit('staff-message-create', session.user.id, 10);
  const [priorMessage] = await db.select({ ticketId: supportTicketMessage.ticketId })
    .from(supportTicketMessage)
    .where(and(eq(supportTicketMessage.senderUserId, session.user.id), eq(supportTicketMessage.clientMessageId, parsed.data.clientMessageId)))
    .limit(1);
  if (priorMessage) return { success: true, id: priorMessage.ticketId };
  if (parsed.data.recipientUserIds.includes(session.user.id)) throw new Error('You cannot start a conversation with yourself.');
  const activeStaff = await listActiveRRAStaff();
  const recipientIds = [...new Set(parsed.data.recipientUserIds)];
  const recipients = activeStaff.filter((staff) => recipientIds.includes(staff.userId)
    && staff.roles.some((role) => hasRRAPermission(role, 'communications.staff.use')));
  if (recipients.length !== recipientIds.length) throw new Error('One or more recipients are unavailable for staff messaging.');
  const { subject, body, clientMessageId } = parsed.data;
  let notifyIds: string[] = [];
  try {
    const conversation = await db.transaction(async (tx) => {
      const [created] = await tx.insert(supportTicket).values({
        traderId: null,
        threadType: 'staff',
        category: 'staff_internal',
        subject,
        description: body,
        status: 'in_progress',
        priority: 'medium',
      }).returning({ id: supportTicket.id, createdAt: supportTicket.createdAt });
      if (!created) throw new Error('Conversation could not be created.');
      await tx.insert(supportTicketMessage).values({
        id: crypto.randomUUID(), ticketId: created.id, senderUserId: session.user.id,
        authorId: session.user.id,
        senderType: 'staff', body, clientMessageId, createdAt: created.createdAt,
      });
      await tx.insert(supportTicketParticipant).values([
        { id: crypto.randomUUID(), ticketId: created.id, userId: session.user.id, participantType: 'staff', lastReadAt: created.createdAt },
        ...recipients.map((staff) => ({ id: crypto.randomUUID(), ticketId: created.id, userId: staff.userId, participantType: 'staff', lastReadAt: null })),
      ]);
      await tx.insert(auditLog).values(auditEntry(session.user.id, 'STAFF_MESSAGE_CONVERSATION_CREATED', created.id, {
        recipientCount: recipients.length,
      }));
      notifyIds = await insertSafeNotifications(tx, recipients.map((staff) => staff.userId), `/admin/messages?conversation=${created.id}`);
      return created;
    });
    emitToUsers(notifyIds, 'notification', { type: 'message_received', title: 'New TaxFlow message', link: `/admin/messages?conversation=${conversation.id}` });
    emitToUsers(notifyIds, 'message', { conversationId: conversation.id });
    return { success: true, id: conversation.id };
  } catch (error) {
    console.error('[messaging] Could not start staff conversation:', error);
    throw new Error('TaxFlow could not start the staff conversation. Please try again.');
  }
}

export async function startStaffTaxpayerConversation(input: unknown): Promise<{ success: true; id: string }> {
  const parsed = createStaffTaxpayerConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Message details are invalid.');
  const session = await requireRRAPermission('taxpayer.intelligence.search');
  if (!session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'support.manage'))) {
    throw new Error('You are not authorized to initiate taxpayer communications.');
  }
  await applyRateLimit('staff-taxpayer-message-create', session.user.id, 10);
  const [priorMessage] = await db.select({ ticketId: supportTicketMessage.ticketId })
    .from(supportTicketMessage)
    .where(and(eq(supportTicketMessage.senderUserId, session.user.id), eq(supportTicketMessage.clientMessageId, parsed.data.clientMessageId)))
    .limit(1);
  if (priorMessage) return { success: true, id: priorMessage.ticketId };
  if (parsed.data.recipientUserId === session.user.id) throw new Error('Choose a taxpayer recipient.');
  const [recipient] = await db.select({ id: user.id, isActive: user.isActive, role: user.role })
    .from(user).where(eq(user.id, parsed.data.recipientUserId)).limit(1);
  if (!recipient?.isActive || recipient.role === 'rra_staff') throw new Error('Taxpayer recipient was not found.');
  const rules = await getMessagingRoutes();
  const category = parsed.data.category;
  if (!session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, category, rules))) {
    throw new Error('You are not authorized to handle this message category.');
  }
  const route = routeRuleFor(category, rules);
  let notificationUsers: string[] = [];
  try {
    const conversation = await db.transaction(async (tx) => {
      const [created] = await tx.insert(supportTicket).values({
        traderId: recipient.id,
        threadType: 'taxpayer',
        category,
        routingCategory: category,
        routingDepartment: route.department,
        routingReason: 'Initiated by authorized RRA staff.',
        subject: parsed.data.subject,
        description: parsed.data.body,
        status: 'awaiting_user',
        priority: 'medium',
        assignedToId: session.user.id,
      }).returning({ id: supportTicket.id, createdAt: supportTicket.createdAt });
      if (!created) throw new Error('Conversation could not be created.');
      await tx.insert(supportTicketMessage).values({
        id: crypto.randomUUID(), ticketId: created.id, senderUserId: session.user.id,
        authorId: session.user.id,
        senderType: 'staff', body: parsed.data.body, clientMessageId: parsed.data.clientMessageId,
        createdAt: created.createdAt,
      });
      await tx.insert(supportTicketParticipant).values([
        { id: crypto.randomUUID(), ticketId: created.id, userId: session.user.id, participantType: 'staff', lastReadAt: created.createdAt },
        { id: crypto.randomUUID(), ticketId: created.id, userId: recipient.id, participantType: 'taxpayer', lastReadAt: null },
      ]);
      await tx.insert(auditLog).values(auditEntry(session.user.id, 'TAXPAYER_MESSAGE_CONVERSATION_CREATED', created.id, {
        category, recipientUserId: recipient.id,
      }));
      notificationUsers = await insertSafeNotifications(tx, [recipient.id], `/dashboard/messages?conversation=${created.id}`);
      return created;
    });
    emitToUsers(notificationUsers, 'notification', { type: 'message_received', title: 'New TaxFlow message', link: `/dashboard/messages?conversation=${conversation.id}` });
    emitToUsers(notificationUsers, 'message', { conversationId: conversation.id });
    return { success: true, id: conversation.id };
  } catch (error) {
    console.error('[messaging] Could not start staff-to-taxpayer conversation:', error);
    throw new Error('TaxFlow could not send the message. Please try again.');
  }
}

type InboxRow = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  threadType: string;
  updatedAt: Date;
  createdAt: Date;
  traderId: string | null;
  traderName: string | null;
  assignedToId: string | null;
  routingReason: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
};

async function latestMessageMap(ticketIds: string[]): Promise<Map<string, { body: string; createdAt: Date }>> {
  if (!ticketIds.length) return new Map();
  const rows = await db.selectDistinctOn([supportTicketMessage.ticketId], {
    ticketId: supportTicketMessage.ticketId, body: supportTicketMessage.body, createdAt: supportTicketMessage.createdAt,
  })
    .from(supportTicketMessage)
    .where(inArray(supportTicketMessage.ticketId, ticketIds))
    .orderBy(supportTicketMessage.ticketId, desc(supportTicketMessage.createdAt), desc(supportTicketMessage.id));
  const result = new Map<string, { body: string; createdAt: Date }>();
  for (const row of rows) if (!result.has(row.ticketId)) result.set(row.ticketId, row);
  return result;
}

async function unreadMap(ticketIds: string[], readerUserId: string): Promise<Map<string, number>> {
  if (!ticketIds.length) return new Map();
  const rows = await db.select({
    ticketId: supportTicketMessage.ticketId,
    count: sql<number>`COUNT(${supportTicketMessage.id})::int`,
  })
    .from(supportTicketMessage)
    .leftJoin(supportTicketParticipant, and(
      eq(supportTicketParticipant.ticketId, supportTicketMessage.ticketId),
      eq(supportTicketParticipant.userId, readerUserId),
    ))
    .where(and(
      inArray(supportTicketMessage.ticketId, ticketIds),
      ne(supportTicketMessage.senderUserId, readerUserId),
      gt(supportTicketMessage.createdAt, sql`COALESCE(${supportTicketParticipant.lastReadAt}, TIMESTAMP 'epoch')`),
    ))
    .groupBy(supportTicketMessage.ticketId);
  return new Map(rows.map((row) => [row.ticketId, row.count]));
}

function toInboxRows(
  tickets: Array<{
    id: string; subject: string; category: string; status: string; priority: string; threadType: string;
    updatedAt: Date; createdAt: Date; traderId: string | null; traderName: string | null;
    assignedToId: string | null; routingReason: string | null;
  }>,
  latest: Map<string, { body: string; createdAt: Date }>,
  unread: Map<string, number>,
): InboxRow[] {
  return tickets.map((ticket) => {
    const message = latest.get(ticket.id);
    return {
      ...ticket,
      lastMessage: message?.body ?? '',
      lastMessageAt: message?.createdAt ?? ticket.updatedAt,
      unreadCount: unread.get(ticket.id) ?? 0,
    };
  });
}

export async function listMyConversations(filterInput?: unknown): Promise<InboxRow[]> {
  const filter = conversationFilterSchema.safeParse(filterInput ?? {});
  if (!filter.success) throw new Error('Conversation filter is invalid.');
  const session = await requireTraderSession();
  const { status, search } = filter.data;
  const where = and(
    eq(supportTicket.traderId, session.user.id),
    eq(supportTicket.threadType, 'taxpayer'),
    status === 'all' ? undefined : eq(supportTicket.status, status),
    sql`NOT EXISTS (SELECT 1 FROM public.support_ticket_participant p WHERE p.ticket_id = ${supportTicket.id} AND p.user_id = ${session.user.id} AND p.archived_at IS NOT NULL)`,
      search ? or(ilike(supportTicket.subject, `%${search}%`), ilike(supportTicket.category, `%${search}%`), ilike(user.name, `%${search}%`)) : undefined,
  );
  const tickets = await db.select({
    id: supportTicket.id, subject: supportTicket.subject, category: supportTicket.category,
    status: supportTicket.status, priority: supportTicket.priority, threadType: supportTicket.threadType,
    updatedAt: supportTicket.updatedAt, createdAt: supportTicket.createdAt,
    traderId: supportTicket.traderId, traderName: sql<string | null>`COALESCE(${user.businessName}, ${user.name})`,
    assignedToId: supportTicket.assignedToId, routingReason: supportTicket.routingReason,
  })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.assignedToId))
    .where(where)
    .orderBy(desc(supportTicket.updatedAt))
    .limit(100);
  const ids = tickets.map((ticket) => ticket.id);
  const [latest, unread] = await Promise.all([latestMessageMap(ids), unreadMap(ids, session.user.id)]);
  return toInboxRows(tickets, latest, unread);
}

function staffVisibilityCondition(staff: ActorStaff, rules: readonly MessagingRouteRule[]) {
  const eligibleRules = rules.filter((rule) => staff.roles.some((role) => hasRRAPermission(role, 'communications.staff.use') && rule.roles.includes(role)));
  const routingConditions = eligibleRules.flatMap((rule) => {
    const category = sql`COALESCE(${supportTicket.routingCategory}, ${supportTicket.category}) = ${rule.category}`;
    const department = rule.department === null ? undefined : sql`lower(trim(COALESCE((SELECT rs.department FROM public.rra_staff rs WHERE rs.user_id = ${staff.userId} AND rs.is_active = true LIMIT 1), ''))) = lower(${rule.department})`;
    return [
      and(eq(supportTicket.threadType, 'taxpayer'), isNull(supportTicket.assignedToId), category, department),
      and(eq(supportTicket.threadType, 'taxpayer'), eq(supportTicket.assignedToId, staff.userId), category, department),
    ];
  });
  const staffParticipant = db.select({ id: supportTicketParticipant.id })
    .from(supportTicketParticipant)
    .where(and(
      eq(supportTicketParticipant.ticketId, supportTicket.id),
      eq(supportTicketParticipant.userId, staff.userId),
      eq(supportTicketParticipant.participantType, 'staff'),
    ));
  return or(
    and(eq(supportTicket.threadType, 'staff'), sql`EXISTS (${staffParticipant})`),
    ...routingConditions,
  );
}

export async function listRRAConversations(filterInput?: unknown): Promise<InboxRow[]> {
  const filter = conversationFilterSchema.safeParse(filterInput ?? {});
  if (!filter.success) throw new Error('Conversation filter is invalid.');
  const session = await requireRRAPermission('communications.staff.use');
  const staff: ActorStaff = {
    userId: session.user.id,
    staffRecordId: session.staff.id,
    department: session.staff.department,
    roles: session.staff.clearanceRoles,
  };
  const search = filter.data.search;
  const tickets = await db.select({
    id: supportTicket.id, subject: supportTicket.subject, category: supportTicket.category,
    status: supportTicket.status, priority: supportTicket.priority, threadType: supportTicket.threadType,
    updatedAt: supportTicket.updatedAt, createdAt: supportTicket.createdAt,
    traderId: supportTicket.traderId,
    traderName: sql<string | null>`COALESCE(${user.businessName}, ${user.name})`,
    assignedToId: supportTicket.assignedToId, routingReason: supportTicket.routingReason,
  })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.traderId))
    .where(and(
      staffVisibilityCondition(staff, await getMessagingRoutes()),
      filter.data.status === 'all' ? undefined : eq(supportTicket.status, filter.data.status),
      search ? or(
        ilike(supportTicket.subject, `%${search}%`),
        ilike(user.name, `%${search}%`),
        ilike(user.businessName, `%${search}%`),
        sql`EXISTS (
          SELECT 1
          FROM public.support_ticket_participant p
          JOIN public."user" participant_user ON participant_user.id = p.user_id
          WHERE p.ticket_id = ${supportTicket.id}
            AND p.participant_type = 'staff'
            AND participant_user.name ILIKE ${`%${search}%`}
        )`,
      ) : undefined,
    ))
    .orderBy(desc(supportTicket.updatedAt))
    .limit(100);
  const ids = tickets.map((ticket) => ticket.id);
  const [latest, unread, archived] = await Promise.all([
    latestMessageMap(ids), unreadMap(ids, session.user.id),
    ids.length ? db.select({ ticketId: supportTicketParticipant.ticketId })
      .from(supportTicketParticipant)
      .where(and(inArray(supportTicketParticipant.ticketId, ids), eq(supportTicketParticipant.userId, session.user.id), sql`${supportTicketParticipant.archivedAt} IS NOT NULL`))
      : Promise.resolve([]),
  ]);
  const archivedIds = new Set(archived.map((row) => row.ticketId));
  return toInboxRows(tickets.filter((ticket) => !archivedIds.has(ticket.id)), latest, unread);
}

async function markConversationRead(ticketId: string, userId: string, type: 'taxpayer' | 'staff' | 'queue'): Promise<void> {
  const [latest] = await db.select({ createdAt: supportTicketMessage.createdAt })
    .from(supportTicketMessage)
    .where(eq(supportTicketMessage.ticketId, ticketId))
    .orderBy(desc(supportTicketMessage.createdAt), desc(supportTicketMessage.id))
    .limit(1);
  await db.insert(supportTicketParticipant).values({
    id: crypto.randomUUID(), ticketId, userId, participantType: type, lastReadAt: latest?.createdAt ?? new Date(),
  }).onConflictDoUpdate({
    target: [supportTicketParticipant.ticketId, supportTicketParticipant.userId],
    set: { lastReadAt: latest?.createdAt ?? new Date(), archivedAt: null },
  });
}

export async function getMyConversationMessages(input: unknown): Promise<Array<{
  id: string; senderUserId: string; senderName: string; senderType: string; senderRole: string; body: string; createdAt: Date;
}>> {
  const parsed = messagePageSchema.safeParse(input);
  if (!parsed.success) throw new Error('Conversation page request is invalid.');
  const session = await requireTraderSession();
  const [ticket] = await db.select({ id: supportTicket.id })
    .from(supportTicket)
    .where(and(eq(supportTicket.id, parsed.data.ticketId), eq(supportTicket.traderId, session.user.id), eq(supportTicket.threadType, 'taxpayer')))
    .limit(1);
  if (!ticket) throw new Error('Conversation not found.');
  const messages = await db.select({
    id: supportTicketMessage.id, senderUserId: supportTicketMessage.senderUserId,
    senderName: user.name, senderType: supportTicketMessage.senderType,
    senderRole: sql<string>`COALESCE(${rraStaff.clearanceLevel}, ${user.role})`,
    body: supportTicketMessage.body, createdAt: supportTicketMessage.createdAt,
  })
    .from(supportTicketMessage)
    .innerJoin(user, eq(user.id, supportTicketMessage.senderUserId))
    .leftJoin(rraStaff, eq(rraStaff.userId, user.id))
    .where(and(eq(supportTicketMessage.ticketId, parsed.data.ticketId), parsed.data.before ? lt(supportTicketMessage.createdAt, new Date(parsed.data.before)) : undefined))
    .orderBy(desc(supportTicketMessage.createdAt), desc(supportTicketMessage.id))
    .limit(50);
  if (!parsed.data.before) await markConversationRead(parsed.data.ticketId, session.user.id, 'taxpayer');
  return messages.reverse();
}

export async function getRRAConversationMessages(input: unknown): Promise<Array<{
  id: string; senderUserId: string; senderName: string; senderType: string; senderRole: string; body: string; createdAt: Date;
}>> {
  const parsed = messagePageSchema.safeParse(input);
  if (!parsed.success) throw new Error('Conversation page request is invalid.');
  const session = await requireRRAPermission('communications.staff.use');
  const rules = await getMessagingRoutes();
  const staff: ActorStaff = { userId: session.user.id, staffRecordId: session.staff.id, department: session.staff.department, roles: session.staff.clearanceRoles };
  const ticket = await requireCanReadForStaff(parsed.data.ticketId, staff, rules);
  const messages = await db.select({
    id: supportTicketMessage.id, senderUserId: supportTicketMessage.senderUserId,
    senderName: user.name, senderType: supportTicketMessage.senderType,
    senderRole: sql<string>`COALESCE(${rraStaff.clearanceLevel}, ${user.role})`,
    body: supportTicketMessage.body, createdAt: supportTicketMessage.createdAt,
  })
    .from(supportTicketMessage)
    .innerJoin(user, eq(user.id, supportTicketMessage.senderUserId))
    .leftJoin(rraStaff, eq(rraStaff.userId, user.id))
    .where(and(eq(supportTicketMessage.ticketId, parsed.data.ticketId), parsed.data.before ? lt(supportTicketMessage.createdAt, new Date(parsed.data.before)) : undefined))
    .orderBy(desc(supportTicketMessage.createdAt), desc(supportTicketMessage.id))
    .limit(50);
  if (!parsed.data.before) await markConversationRead(parsed.data.ticketId, session.user.id, ticket.threadType === 'staff' || ticket.assignedToId === session.user.id ? 'staff' : 'queue');
  return messages.reverse();
}

export async function replyToConversation(input: unknown): Promise<{ success: true; duplicate?: true }> {
  const parsed = replyToConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Message details are invalid.');
  const baseSession = await requireSession();
  const staffSession = baseSession.user.role === 'rra_staff'
    ? await requireRRAPermission('communications.staff.use')
    : null;
  const traderSession = staffSession ? null : await requireTraderSession();
  const actorId = staffSession?.user.id ?? traderSession?.user.id;
  if (!actorId) throw new Error('Sign in before sending a message.');
  const actorType = staffSession ? 'staff' as const : 'taxpayer' as const;
  await applyRateLimit('message-reply', actorId, 20);
  const rules = await getMessagingRoutes();
  const staff: ActorStaff | null = staffSession ? {
    userId: staffSession.user.id, staffRecordId: staffSession.staff.id,
    department: staffSession.staff.department, roles: staffSession.staff.clearanceRoles,
  } : null;
  let notificationUsers: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: supportTicketMessage.id })
        .from(supportTicketMessage)
        .where(and(eq(supportTicketMessage.senderUserId, actorId), eq(supportTicketMessage.clientMessageId, parsed.data.clientMessageId)))
        .limit(1);
      if (existing) return { duplicate: true as const, recipientIds: [] as string[] };
      const [ticket] = await tx.select().from(supportTicket).where(eq(supportTicket.id, parsed.data.ticketId)).for('update').limit(1);
      if (!ticket) throw new Error('Conversation not found.');
      if (ticket.threadType === 'staff') {
        if (!staff) throw new Error('Conversation not found.');
        const [participant] = await tx.select({ id: supportTicketParticipant.id })
          .from(supportTicketParticipant)
          .where(and(eq(supportTicketParticipant.ticketId, ticket.id), eq(supportTicketParticipant.userId, actorId), eq(supportTicketParticipant.participantType, 'staff')))
          .limit(1);
        if (!participant) throw new Error('Conversation not found.');
      } else if (staff) {
        const canReply = staffCanReadCategory(staff, ticketCategory(ticket), rules)
          && (ticket.assignedToId === actorId || ticket.assignedToId === null);
        if (!canReply) throw new Error('Conversation not found.');
        if (ticket.assignedToId === null) {
          const claimed = await tx.update(supportTicket)
            .set({ assignedToId: actorId, status: 'in_progress', updatedAt: new Date() })
            .where(and(eq(supportTicket.id, ticket.id), isNull(supportTicket.assignedToId)))
            .returning({ id: supportTicket.id });
          if (!claimed.length) throw new Error('This conversation was assigned to another officer. Refresh and try again.');
        }
      } else if (ticket.traderId !== actorId) {
        throw new Error('Conversation not found.');
      }

      const createdAt = new Date();
      await tx.insert(supportTicketMessage).values({
        id: crypto.randomUUID(), ticketId: ticket.id, senderUserId: actorId,
        authorId: actorId,
        senderType: actorType, body: parsed.data.body, clientMessageId: parsed.data.clientMessageId, createdAt,
      });
      const status = staff
        ? ticket.threadType === 'staff' ? 'in_progress' : 'awaiting_user'
        : 'awaiting_staff';
      await tx.update(supportTicket).set({ status, resolvedAt: null, updatedAt: createdAt }).where(eq(supportTicket.id, ticket.id));
      await upsertParticipant(tx, ticket.id, actorId, actorType, createdAt);

      let recipients: string[] = [];
      if (ticket.threadType === 'staff') {
        const others = await tx.select({ userId: supportTicketParticipant.userId })
          .from(supportTicketParticipant)
          .where(and(eq(supportTicketParticipant.ticketId, ticket.id), ne(supportTicketParticipant.userId, actorId), eq(supportTicketParticipant.participantType, 'staff')));
        recipients = others.map((row) => row.userId);
      } else if (staff) {
        recipients = ticket.traderId ? [ticket.traderId] : [];
      } else if (ticket.assignedToId) {
        recipients = [ticket.assignedToId];
      } else {
        const routeCategory = legacyCategory(ticket.routingCategory ?? ticket.category) ?? 'general';
        recipients = await queueRecipients(routeCategory, ticket.routingDepartment, rules);
      }

      await tx.insert(auditLog).values(auditEntry(actorId, 'MESSAGE_SENT', ticket.id, {
        senderType: actorType, recipientCount: recipients.length,
      }));
      if (recipients.length) {
        await tx.update(supportTicketParticipant).set({ archivedAt: null })
          .where(and(eq(supportTicketParticipant.ticketId, ticket.id), inArray(supportTicketParticipant.userId, recipients)));
      }
      notificationUsers = await insertSafeNotifications(tx, recipients, staff ? `/dashboard/messages?conversation=${ticket.id}` : `/admin/messages?conversation=${ticket.id}`);
      return { duplicate: false as const, recipientIds: notificationUsers };
    });
    if (result.duplicate) return { success: true, duplicate: true };
    emitToUsers(notificationUsers, 'notification', { type: 'message_received', title: 'New TaxFlow message', link: staffSession ? `/dashboard/messages?conversation=${parsed.data.ticketId}` : `/admin/messages?conversation=${parsed.data.ticketId}` });
    emitToUsers(notificationUsers, 'message', { conversationId: parsed.data.ticketId });
    return { success: true };
  } catch (error) {
    console.error('[messaging] Could not send message:', error);
    if (error instanceof Error && error.message === 'This conversation was assigned to another officer. Refresh and try again.') throw error;
    throw new Error('TaxFlow could not send your message. Please try again.');
  }
}

export async function assignMessageConversation(input: unknown): Promise<{ success: true }> {
  const parsed = assignConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Assignment details are invalid.');
  const session = await requireRRAPermission('support.manage');
  const rules = await getMessagingRoutes();
  const actor: ActorStaff = { userId: session.user.id, staffRecordId: session.staff.id, department: session.staff.department, roles: session.staff.clearanceRoles };
  const ticket = await requireCanReadForStaff(parsed.data.ticketId, actor, rules);
  if (ticket.threadType !== 'taxpayer') throw new Error('Staff-only conversations cannot be assigned to taxpayer case queues.');
  const category = ticketCategory(ticket);
  const targetStaff = (await listActiveRRAStaff()).find((staff) => staff.userId === parsed.data.staffUserId);
  if (!targetStaff || !targetStaff.roles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, legacyCategory(ticket.routingCategory ?? ticket.category) ?? category, rules))
    || (ticket.routingDepartment && targetStaff.department?.trim().toLocaleLowerCase() !== ticket.routingDepartment.toLocaleLowerCase())) {
    throw new Error('Choose an active officer authorized for this message category and department.');
  }
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(supportTicket).where(eq(supportTicket.id, ticket.id)).for('update').limit(1);
      if (!locked || locked.threadType !== 'taxpayer'
        || (locked.assignedToId !== null && locked.assignedToId !== actor.userId)) {
        throw new Error('Conversation not found.');
      }
      const lockedCategory = ticketCategory(locked);
      if (!staffCanReadCategory(actor, lockedCategory, rules)
        || (locked.assignedToId !== null && locked.assignedToId !== actor.userId)) {
        throw new Error('Conversation not found.');
      }
      const [currentTarget] = await tx.select({
        staffRecordId: rraStaff.id,
        department: rraStaff.department,
        clearanceLevel: rraStaff.clearanceLevel,
      })
        .from(rraStaff)
        .innerJoin(user, eq(user.id, rraStaff.userId))
        .where(and(eq(rraStaff.userId, targetStaff.userId), eq(rraStaff.isActive, true), eq(user.isActive, true), eq(user.role, 'rra_staff')))
        .limit(1);
      const currentRoles = currentTarget
        ? await tx.select({ role: rraStaffRole.role }).from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, currentTarget.staffRecordId))
        : [];
      const targetRoles = (currentRoles.length ? currentRoles.map((row) => row.role) : currentTarget ? [currentTarget.clearanceLevel] : []).filter(isRRARole);
      if (!currentTarget || !targetRoles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, lockedCategory, rules))
        || (locked.routingDepartment && currentTarget.department?.trim().toLocaleLowerCase() !== locked.routingDepartment.toLocaleLowerCase())) {
        throw new Error('Choose an active officer authorized for this message category and department.');
      }
      await tx.update(supportTicket).set({ assignedToId: targetStaff.userId, status: 'in_progress', updatedAt: new Date() }).where(eq(supportTicket.id, locked.id));
      await upsertParticipant(tx, locked.id, targetStaff.userId, 'staff', null);
      await tx.insert(auditLog).values(auditEntry(session.user.id, 'MESSAGE_CONVERSATION_ASSIGNED', locked.id, {
        assignedToUserId: targetStaff.userId, reason: parsed.data.reason,
      }));
      await insertSafeNotifications(tx, [targetStaff.userId], `/admin/messages?conversation=${locked.id}`, 'TaxFlow message assigned');
    });
  } catch (error) {
    console.error('[messaging] Could not assign conversation:', error);
    if (error instanceof Error && (error.message === 'Conversation not found.' || error.message.startsWith('Choose an active officer'))) throw error;
    throw new Error('TaxFlow could not assign this conversation. Please try again.');
  }
  emitToUsers([targetStaff.userId], 'notification', { type: 'message_received', title: 'TaxFlow message assigned', message: GENERIC_NOTIFICATION, link: `/admin/messages?conversation=${ticket.id}` });
  emitToUsers([targetStaff.userId], 'message', { conversationId: ticket.id });
  return { success: true };
}

export async function correctMessageRouting(input: unknown): Promise<{ success: true; category: MessageCategory }> {
  const parsed = correctRoutingSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Routing correction is invalid.');
  const session = await requireRRAPermission('support.manage');
  const rules = await getMessagingRoutes();
  const actor: ActorStaff = { userId: session.user.id, staffRecordId: session.staff.id, department: session.staff.department, roles: session.staff.clearanceRoles };
  const ticket = await requireCanReadForStaff(parsed.data.ticketId, actor, rules);
  if (ticket.threadType !== 'taxpayer') throw new Error('Internal staff conversations do not use taxpayer routing.');
  if (!staffCanReadCategory(actor, parsed.data.category, rules)) {
    throw new Error('You are not authorized to route this conversation to that category.');
  }

  const desiredRule = routeRuleFor(parsed.data.category, rules);
  let routingCategory = parsed.data.category;
  let route = desiredRule;
  let recipients = await queueRecipients(routingCategory, route.department, rules);
  let routingReason = `Staff corrected classification: ${parsed.data.reason}`;
  if (!recipients.length && routingCategory !== 'general') {
    routingCategory = 'general';
    route = routeRuleFor('general', rules);
    recipients = await queueRecipients('general', route.department, rules);
    routingReason = `Staff corrected classification to ${parsed.data.category}, but no active handler was available. Sent to general review. Reason: ${parsed.data.reason}`;
  }
  if (!recipients.length) throw new Error('No active authorized RRA support queue is available. The conversation was not changed.');

  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(supportTicket).where(eq(supportTicket.id, ticket.id)).for('update').limit(1);
      if (!locked || locked.threadType !== 'taxpayer'
        || (locked.assignedToId !== null && locked.assignedToId !== actor.userId)
        || !staffCanReadCategory(actor, ticketCategory(locked), rules)) {
        throw new Error('Conversation not found.');
      }
      if (!staffCanReadCategory(actor, parsed.data.category, rules)) {
        throw new Error('You are not authorized to route this conversation to that category.');
      }
      const updated = await tx.update(supportTicket).set({
        category: parsed.data.category,
        routingCategory,
        routingDepartment: route.department,
        routingReason,
        assignedToId: null,
        status: 'awaiting_staff',
        updatedAt: new Date(),
        resolvedAt: null,
      }).where(eq(supportTicket.id, locked.id)).returning({ id: supportTicket.id });
      if (!updated.length) throw new Error('Conversation not found.');
      await tx.insert(auditLog).values(auditEntry(session.user.id, 'MESSAGE_ROUTING_CORRECTED', locked.id, {
        fromCategory: locked.routingCategory ?? locked.category,
        category: parsed.data.category,
        routingCategory,
        routingDepartment: route.department,
        reason: parsed.data.reason,
        recipientCount: recipients.length,
      }));
      await insertSafeNotifications(tx, recipients, `/admin/messages?conversation=${locked.id}`, 'TaxFlow message needs review');
    });
  } catch (error) {
    console.error('[messaging] Could not correct conversation routing:', error);
    if (error instanceof Error && (error.message === 'Conversation not found.' || error.message === 'You are not authorized to route this conversation to that category.')) throw error;
    throw new Error('TaxFlow could not update the conversation routing. Please try again.');
  }
  emitToUsers(recipients, 'notification', { type: 'message_received', title: 'TaxFlow message needs review', message: GENERIC_NOTIFICATION, link: `/admin/messages?conversation=${ticket.id}` });
  emitToUsers(recipients, 'message', { conversationId: ticket.id });
  return { success: true, category: parsed.data.category };
}

export async function resolveMessageConversation(input: unknown): Promise<{ success: true }> {
  const parsed = resolveConversationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Resolution details are invalid.');
  const session = await requireRRAPermission('support.manage');
  const rules = await getMessagingRoutes();
  const staff: ActorStaff = { userId: session.user.id, staffRecordId: session.staff.id, department: session.staff.department, roles: session.staff.clearanceRoles };
  const ticket = await requireCanReadForStaff(parsed.data.ticketId, staff, rules);
  if (ticket.threadType !== 'taxpayer') throw new Error('Staff-only conversations are archived by participants.');
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(supportTicket).where(eq(supportTicket.id, ticket.id)).for('update').limit(1);
      if (!locked || locked.threadType !== 'taxpayer' || !staffCanReadCategory(staff, ticketCategory(locked), rules)
        || (locked.assignedToId !== null && locked.assignedToId !== staff.userId)) {
        throw new Error('Conversation not found.');
      }
      await tx.update(supportTicket).set({ status: 'resolved', resolution: parsed.data.resolution, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(supportTicket.id, locked.id));
      await tx.insert(auditLog).values(auditEntry(session.user.id, 'MESSAGE_CONVERSATION_RESOLVED', locked.id, { resolution: parsed.data.resolution }));
      if (locked.traderId) await insertSafeNotifications(tx, [locked.traderId], `/dashboard/messages?conversation=${locked.id}`, 'TaxFlow message update');
    });
  } catch (error) {
    console.error('[messaging] Could not resolve conversation:', error);
    if (error instanceof Error && error.message === 'Conversation not found.') throw error;
    throw new Error('TaxFlow could not resolve this conversation. Please try again.');
  }
  if (ticket.traderId) emitToUsers([ticket.traderId], 'notification', { type: 'message_received', title: 'TaxFlow message update', message: GENERIC_NOTIFICATION, link: `/dashboard/messages?conversation=${ticket.id}` });
  return { success: true };
}

export async function archiveMessageConversation(ticketId: string): Promise<{ success: true }> {
  const parsedId = conversationIdSchema.safeParse(ticketId);
  if (!parsedId.success) throw new Error('Conversation not found.');
  const id = parsedId.data;
  const base = await requireSession();
  if (base.user.role !== 'rra_staff') {
    const session = await requireTraderSession();
    const [ticket] = await db.select({ id: supportTicket.id })
      .from(supportTicket).where(and(eq(supportTicket.id, id), eq(supportTicket.traderId, session.user.id), eq(supportTicket.threadType, 'taxpayer'))).limit(1);
    if (!ticket) throw new Error('Conversation not found.');
    try {
      await db.transaction(async (tx) => {
        await tx.update(supportTicketParticipant).set({ archivedAt: new Date() })
          .where(and(eq(supportTicketParticipant.ticketId, id), eq(supportTicketParticipant.userId, session.user.id)));
        await tx.insert(auditLog).values(auditEntry(session.user.id, 'MESSAGE_CONVERSATION_ARCHIVED', id, { threadType: 'taxpayer' }));
      });
    } catch (error) {
      console.error('[messaging] Could not archive taxpayer conversation:', error);
      throw new Error('TaxFlow could not archive this conversation. Please try again.');
    }
    return { success: true };
  }
  const rra = await requireRRAPermission('communications.staff.use');
  const rules = await getMessagingRoutes();
  const staff: ActorStaff = { userId: rra.user.id, staffRecordId: rra.staff.id, department: rra.staff.department, roles: rra.staff.clearanceRoles };
  const ticket = await requireCanReadForStaff(id, staff, rules);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(supportTicketParticipant).values({
        id: crypto.randomUUID(), ticketId: id, userId: rra.user.id,
        participantType: ticket.threadType === 'staff' || ticket.assignedToId === rra.user.id ? 'staff' : 'queue',
        archivedAt: new Date(), lastReadAt: new Date(),
      }).onConflictDoUpdate({ target: [supportTicketParticipant.ticketId, supportTicketParticipant.userId], set: { archivedAt: new Date() } });
      await tx.insert(auditLog).values(auditEntry(rra.user.id, 'MESSAGE_CONVERSATION_ARCHIVED', id, { threadType: ticket.threadType }));
    });
  } catch (error) {
    console.error('[messaging] Could not archive RRA conversation:', error);
    throw new Error('TaxFlow could not archive this conversation. Please try again.');
  }
  return { success: true };
}

export async function getMessagingRoutingSettings(): Promise<MessagingRouteRule[]> {
  await requireRRAPermission('system.configure');
  return getMessagingRoutes();
}

export async function saveMessagingRoutingSettings(input: unknown): Promise<{ success: true }> {
  const session = await requireRRAPermission('system.configure');
  const parsed = routingConfigSchema.safeParse(input);
  if (!parsed.success || parsed.data.some((rule) => rule.roles.some((role) => !isRRARole(role)))) {
    throw new Error(parsed.success ? 'Routing contains an unknown RRA role.' : parsed.error.issues[0]?.message ?? 'Routing settings are invalid.');
  }
  const rules: MessagingRouteRule[] = parsed.data.map((rule) => ({ ...rule, roles: rule.roles.filter(isRRARole) }));
  if (rules.some((rule) => rule.roles.some((role) => !canRoleHandleCategory(role, rule.category, rules)))) {
    throw new Error('A category cannot be routed to roles without the existing permission for that work.');
  }
  if (rules.some((rule) => !rule.roles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, rule.category, rules)))) {
    throw new Error('Every category must have at least one active role authorized for TaxFlow messaging.');
  }
  const general = routeRuleFor('general', rules);
  if (!general.roles.some((role) => hasRRAPermission(role, 'support.manage') && hasRRAPermission(role, 'communications.staff.use'))) {
    throw new Error('The general review queue must include an active support-authorized RRA role.');
  }
  try {
    await db.transaction(async (tx) => {
      await tx.insert(systemConfig).values({ key: ROUTING_CONFIG_KEY, value: JSON.stringify(rules), updatedBy: session.user.id })
        .onConflictDoUpdate({ target: systemConfig.key, set: { value: JSON.stringify(rules), updatedBy: session.user.id, updatedAt: new Date() } });
      await tx.insert(auditLog).values({
        userId: session.user.id,
        action: 'MESSAGE_ROUTING_UPDATED',
        targetType: 'system_config',
        targetId: ROUTING_CONFIG_KEY,
        metadata: JSON.stringify({ categoryCount: rules.length }),
      });
    });
  } catch (error) {
    console.error('[messaging] Could not save routing settings:', error);
    throw new Error('TaxFlow could not save message routing settings. Please try again.');
  }
  return { success: true };
}

export async function getUnreadMessageCount(): Promise<number> {
  const base = await requireSession();
  const rra = base.user.role === 'rra_staff' ? await requireRRAPermission('communications.staff.use') : null;
  const trader = rra ? null : await requireTraderSession();
  const readerId = rra?.user.id ?? trader?.user.id;
  if (!readerId) return 0;
  if (rra) {
    const staff: ActorStaff = { userId: rra.user.id, staffRecordId: rra.staff.id, department: rra.staff.department, roles: rra.staff.clearanceRoles };
    const [result] = await db.select({ count: sql<number>`COUNT(${supportTicketMessage.id})::int` })
      .from(supportTicketMessage)
      .innerJoin(supportTicket, eq(supportTicket.id, supportTicketMessage.ticketId))
      .leftJoin(supportTicketParticipant, and(
        eq(supportTicketParticipant.ticketId, supportTicketMessage.ticketId),
        eq(supportTicketParticipant.userId, readerId),
      ))
      .where(and(
        staffVisibilityCondition(staff, await getMessagingRoutes()),
        ne(supportTicketMessage.senderUserId, readerId),
        gt(supportTicketMessage.createdAt, sql`COALESCE(${supportTicketParticipant.lastReadAt}, TIMESTAMP 'epoch')`),
        sql`${supportTicketParticipant.archivedAt} IS NULL`,
      ));
    return result?.count ?? 0;
  }
  if (!trader) return 0;
  const [result] = await db.select({ count: sql<number>`COUNT(${supportTicketMessage.id})::int` })
    .from(supportTicketMessage)
    .innerJoin(supportTicket, eq(supportTicket.id, supportTicketMessage.ticketId))
    .leftJoin(supportTicketParticipant, and(
      eq(supportTicketParticipant.ticketId, supportTicketMessage.ticketId),
      eq(supportTicketParticipant.userId, readerId),
    ))
    .where(and(
      eq(supportTicket.traderId, trader.user.id),
      eq(supportTicket.threadType, 'taxpayer'),
      ne(supportTicketMessage.senderUserId, readerId),
      gt(supportTicketMessage.createdAt, sql`COALESCE(${supportTicketParticipant.lastReadAt}, TIMESTAMP 'epoch')`),
      sql`${supportTicketParticipant.archivedAt} IS NULL`,
    ));
  return result?.count ?? 0;
}

export async function getRRAStaffRecipientsForCase(ticketId: string): Promise<Array<{
  userId: string; name: string; staffId: string; department: string | null;
}>> {
  const parsedId = conversationIdSchema.safeParse(ticketId);
  if (!parsedId.success) throw new Error('Conversation not found.');
  const session = await requireRRAPermission('support.manage');
  const rules = await getMessagingRoutes();
  const staff: ActorStaff = { userId: session.user.id, staffRecordId: session.staff.id, department: session.staff.department, roles: session.staff.clearanceRoles };
  const ticket = await requireCanReadForStaff(parsedId.data, staff, rules);
  if (ticket.threadType !== 'taxpayer') return [];
  const category = legacyCategory(ticket.routingCategory ?? ticket.category) ?? 'general';
  return (await listActiveRRAStaff())
    .filter((member) => member.roles.some((role) => hasRRAPermission(role, 'communications.staff.use') && canRoleHandleCategory(role, category, rules))
      && (!ticket.routingDepartment || member.department?.trim().toLocaleLowerCase() === ticket.routingDepartment.toLocaleLowerCase()))
    .map(({ userId, name, staffId, department }) => ({ userId, name, staffId, department }));
}


export { MESSAGE_CATEGORIES };
