import assert from 'node:assert/strict';
import test from 'node:test';
import { isLangCode, translate, translateWithContext } from '../lib/language';

const essentialCopy = [
  'Dashboard',
  'Inventory',
  'Production plan',
  'Tax Payments',
  'Make Tax Payment',
  'Payment status',
  'SIMULATED PAYMENT ENVIRONMENT.',
  'Declare Import',
  'Tax Intelligence',
  'Account Settings',
  'Save changes',
  'Access denied',
] as const;

test('Kinyarwanda and French catalogs translate essential TaxFlow interface copy', () => {
  for (const language of ['kiny', 'fr'] as const) {
    for (const source of essentialCopy) {
      assert.notEqual(translate(source, language), source, `${language} is missing: ${source}`);
    }
  }
});

test('English and unknown copy retain the original text', () => {
  assert.equal(translate('Dashboard', 'en'), 'Dashboard');
  assert.equal(translate('User generated message', 'fr'), 'User generated message');
  assert.equal(translate(undefined, 'kiny'), '');
});

test('language code validation only accepts supported choices', () => {
  assert.equal(isLangCode('en'), true);
  assert.equal(isLangCode('kiny'), true);
  assert.equal(isLangCode('fr'), true);
  assert.equal(isLangCode('rw'), false);
  assert.equal(isLangCode(null), false);
});

test('contextual unread notification counts preserve the count and surrounding whitespace', () => {
  assert.equal(translateWithContext('3 unread notifications', 'fr'), '3 notifications non lues');
  assert.equal(translateWithContext('1 unread notification', 'kiny'), 'Ubutumwa 1 budasomwe');
  assert.equal(translateWithContext('  2 unread notifications  ', 'fr'), '  2 notifications non lues  ');
});
