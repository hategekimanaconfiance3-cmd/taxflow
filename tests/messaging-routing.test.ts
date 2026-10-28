import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MESSAGING_ROUTES,
  canRoleHandleCategory,
  classifyMessage,
} from '../lib/messaging/routing';
import { hasRRAPermission } from '../lib/rra-rbac';
import { createUserConversationSchema, replyToConversationSchema } from '../lib/validation/messaging.schema';

test('message routing classifies English, French, and Kinyarwanda request language without rewriting content', () => {
  assert.equal(classifyMessage('VAT invoice', 'I cannot find my invoice').category, 'vat_invoice');
  assert.equal(classifyMessage('Facture TVA', 'Je demande une facture').category, 'vat_invoice');
  assert.equal(classifyMessage('Kwishyura umusoro', 'Ndifuza kwishyura').category, 'tax_payment');
});

test('ambiguous messages go to the manual general queue', () => {
  assert.deepEqual(classifyMessage('Help', 'I need assistance'), {
    category: 'general',
    matchedTerms: [],
    priority: 'medium',
  });
});

test('department routing is role-scoped and does not give every officer the taxpayer queue', () => {
  assert.equal(canRoleHandleCategory('customs_import_officer', 'imports', DEFAULT_MESSAGING_ROUTES), true);
  assert.equal(canRoleHandleCategory('data_ai_analyst', 'imports', DEFAULT_MESSAGING_ROUTES), false);
  assert.equal(canRoleHandleCategory('super_admin', 'imports', DEFAULT_MESSAGING_ROUTES), false);
  assert.equal(canRoleHandleCategory('super_admin', 'general', DEFAULT_MESSAGING_ROUTES), true);
  assert.equal(hasRRAPermission('super_admin', 'taxpayer.intelligence.search'), false);
});

test('message input derives sender identity from the session instead of accepting client identity fields', () => {
  const input = createUserConversationSchema.safeParse({
    category: 'general',
    subject: 'Help',
    body: 'Please help with my account.',
    clientMessageId: '5fdb2a3c-9711-42c3-b4d5-f5886cf62873',
    senderUserId: 'attacker-selected-user',
  });
  assert.equal(input.success, true);
  if (input.success) assert.equal('senderUserId' in input.data, false);
  const reply = replyToConversationSchema.safeParse({
    ticketId: '5fdb2a3c-9711-42c3-b4d5-f5886cf62873',
    body: 'Please see my reply.',
    clientMessageId: '5fdb2a3c-9711-42c3-b4d5-f5886cf62873',
    senderUserId: 'attacker-selected-user',
  });
  assert.equal(reply.success, true);
  if (reply.success) assert.equal('senderUserId' in reply.data, false);
});

test('urgent language changes priority only and does not claim a fraud finding', () => {
  const result = classifyMessage('VAT invoice', 'This is urgent; I cannot access my VAT invoice.');
  assert.equal(result.priority, 'high');
  assert.equal(result.category, 'vat_invoice');
  assert.equal('fraud' in result, false);
});
