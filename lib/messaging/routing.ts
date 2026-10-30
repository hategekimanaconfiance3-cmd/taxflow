import { hasRRAPermission, isRRARole, type RRAPermission, type RRARole } from '@/lib/rra-rbac';

export const MESSAGE_CATEGORIES = [
  'tax_declaration',
  'tin_registration',
  'vat_invoice',
  'tax_payment',
  'production',
  'inventory_transactions',
  'imports',
  'dispute_assessment',
  'account_access',
  'general',
] as const;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export type MessagingRouteRule = {
  category: MessageCategory;
  department: string | null;
  roles: RRARole[];
};

const CATEGORY_PERMISSIONS: Record<MessageCategory, readonly RRAPermission[]> = {
  tax_declaration: ['tax.records.read', 'taxpayer.compliance.read'],
  tin_registration: ['taxpayer.compliance.read'],
  vat_invoice: ['payments.read', 'tax.records.read'],
  tax_payment: ['payments.read'],
  production: ['production.formula.read', 'traceability.read', 'stock.read'],
  inventory_transactions: ['traceability.read', 'stock.read', 'transaction.read'],
  imports: ['imports.read', 'imports.review'],
  dispute_assessment: ['investigation.case.manage', 'compliance.followup.manage'],
  account_access: ['support.manage'],
  general: ['support.manage'],
};

export const DEFAULT_MESSAGING_ROUTES: MessagingRouteRule[] = [
  { category: 'tax_declaration', department: null, roles: ['tax_compliance_officer', 'compliance_officer'] },
  { category: 'tin_registration', department: null, roles: ['tax_compliance_officer', 'compliance_officer'] },
  { category: 'vat_invoice', department: null, roles: ['tax_compliance_officer', 'payments_reconciliation_officer', 'compliance_officer'] },
  { category: 'tax_payment', department: null, roles: ['payments_reconciliation_officer', 'compliance_officer'] },
  { category: 'production', department: null, roles: ['audit_investigation_officer', 'product_traceability_officer', 'audit_officer', 'stock_officer'] },
  { category: 'inventory_transactions', department: null, roles: ['product_traceability_officer', 'audit_investigation_officer', 'stock_officer', 'audit_officer'] },
  { category: 'imports', department: null, roles: ['customs_import_officer', 'compliance_officer'] },
  { category: 'dispute_assessment', department: null, roles: ['audit_investigation_officer', 'tax_compliance_officer', 'audit_officer', 'compliance_officer'] },
  { category: 'account_access', department: null, roles: ['compliance_officer', 'tax_compliance_officer'] },
  { category: 'general', department: null, roles: ['compliance_officer', 'tax_compliance_officer', 'super_admin'] },
];

const KEYWORDS: Record<Exclude<MessageCategory, 'general'>, string[]> = {
  tax_declaration: ['declaration', 'filing', 'return', 'declare tax', 'umusoro', 'umusoro', 'déclaration', 'déclarer', 'impôt'],
  tin_registration: ['tin', 'register', 'registration', 'taxpayer number', 'kwiyandikisha', 'kwandikisha', 'enregistrement', 'immatriculation'],
  vat_invoice: ['vat', 'tva', 'invoice', 'e-invoice', 'facture', 'inyemezabuguzi', 'vat receipt'],
  tax_payment: ['payment', 'paid', 'pay tax', 'refund', 'ubwishyu', 'kwishyura', 'paiement', 'remboursement'],
  production: ['production', 'manufacturing', 'batch', 'recipe', 'umusaruro', 'production batch', 'fabrication'],
  inventory_transactions: ['inventory', 'stock', 'transaction', 'wholesale', 'retail', 'ububiko', 'ibicuruzwa', 'stock movement', 'transaction'],
  imports: ['import', 'customs', 'clearance', 'customs reference', 'ibitumizwa', 'douane', 'importation'],
  dispute_assessment: ['dispute', 'assessment', 'appeal', 'audit', 'ikirego', 'impaka', 'contestation', 'évaluation', 'recours'],
  account_access: ['login', 'sign in', 'password', 'account', 'otp', 'email', 'konti', 'ijambobanga', 'connexion', 'mot de passe'],
};

export function isMessageCategory(value: string): value is MessageCategory {
  return (MESSAGE_CATEGORIES as readonly string[]).includes(value);
}

/** Deterministic keyword routing. Ambiguous messages fall back to manual general review. */
export function classifyMessage(subject: string, body: string): {
  category: MessageCategory;
  matchedTerms: string[];
  priority: 'low' | 'medium' | 'high';
} {
  const normalized = `${subject} ${body}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
  const ranked = Object.entries(KEYWORDS)
    .map(([category, keywords]) => ({
      category: category as Exclude<MessageCategory, 'general'>,
      terms: keywords.filter((keyword) => normalized.includes(keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase())),
    }))
    .filter((item) => item.terms.length > 0)
    .sort((a, b) => b.terms.length - a.terms.length);

  const leading = ranked[0];
  const tied = leading ? ranked.filter((item) => item.terms.length === leading.terms.length) : [];
  const category = tied.length === 1 && leading ? leading.category : 'general';
  const matchedTerms = category === 'general' ? [] : leading?.terms ?? [];
  const priority = /\b(urgent|blocked|cannot access|cannot pay|stopped|fraud|urgent|byihutirwa|bloque|urgent)\b/i.test(normalized)
    ? 'high'
    : 'medium';
  return { category, matchedTerms, priority };
}

export function routeRuleFor(category: MessageCategory, rules: readonly MessagingRouteRule[]): MessagingRouteRule {
  return rules.find((rule) => rule.category === category) ??
    DEFAULT_MESSAGING_ROUTES.find((rule) => rule.category === 'general')!;
}

export function canRoleHandleCategory(role: string, category: MessageCategory, rules: readonly MessagingRouteRule[]): boolean {
  if (!isRRARole(role)) return false;
  return routeRuleFor(category, rules).roles.includes(role)
    && CATEGORY_PERMISSIONS[category].some((permission) => hasRRAPermission(role, permission));
}
