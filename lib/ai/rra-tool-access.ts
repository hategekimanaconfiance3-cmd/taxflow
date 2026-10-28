import { hasRRAPermission, isRRARole, type RRAPermission, type RRARole } from '@/lib/rra-rbac';

export const RRA_AI_TOOL_NAMES = [
  'getTaxpayerIntelligence',
  'lookupTrader',
  'searchTraders',
  'getTransactions',
  'getStockLevels',
  'getStockMovements',
  'getTaxStatus',
  'getRiskAssessment',
  'getRevenueForecastTool',
  'getSystemStats',
  'getBehavioralAnalysis',
  'traceSupplyChain',
  'traceProductJourney',
  'getImportDeclarations',
] as const;

export type RRAAIToolName = (typeof RRA_AI_TOOL_NAMES)[number];

const RRA_AI_INJECTION_PATTERNS = [
  /ignore.{0,30}(previous|above|all).{0,30}instruction/i,
  /you are now/i,
  /system prompt/i,
  /jailbreak/i,
  /act as.{0,20}(DAN|unrestricted|unfiltered)/i,
  /reveal.{0,30}(api key|secret|password|token|env|restricted|hidden)/i,
  /repeat.{0,30}everything.{0,30}said/i,
];

export function isRRAAIInjectionAttempt(message: string): boolean {
  return RRA_AI_INJECTION_PATTERNS.some((pattern) => pattern.test(message));
}

/** A tool is exposed when any one of its existing RRA permissions is granted. */
export const RRA_AI_TOOL_PERMISSIONS: Record<RRAAIToolName, readonly RRAPermission[]> = {
  getTaxpayerIntelligence: ['taxpayer.intelligence.search'],
  lookupTrader: ['taxpayer.compliance.read'],
  searchTraders: ['taxpayer.intelligence.search'],
  getTransactions: ['transaction.read'],
  getStockLevels: ['stock.read'],
  getStockMovements: ['stock.read', 'traceability.read'],
  getTaxStatus: ['taxpayer.compliance.read', 'tax.records.read', 'payments.read'],
  getRiskAssessment: ['ai.findings.read', 'analytics.read', 'investigation.case.manage'],
  getRevenueForecastTool: ['reports.aggregate.read', 'dashboard.executive.read', 'analytics.read'],
  getSystemStats: ['reports.aggregate.read', 'dashboard.executive.read'],
  getBehavioralAnalysis: ['ai.findings.read', 'analytics.read'],
  traceSupplyChain: ['supply_chain.summary.read', 'traceability.read'],
  traceProductJourney: ['traceability.read'],
  getImportDeclarations: ['imports.read', 'imports.review'],
};

/** Resolve assistant tools from the authenticated employee's verified roles. */
export function getRRAAIToolNames(roles: readonly string[] | string): readonly RRAAIToolName[] {
  const assignedRoles = (typeof roles === 'string' ? [roles] : [...roles]).filter(isRRARole);
  if (!assignedRoles.some((role) => hasRRAPermission(role, 'ai.assistant.use'))) return [];
  // Super admin grants console control, but taxpayer intelligence remains
  // unavailable until an operational role is explicitly assigned.
  const operationalRoles = assignedRoles.filter((role) => role !== 'super_admin');
  return RRA_AI_TOOL_NAMES.filter((toolName) =>
    RRA_AI_TOOL_PERMISSIONS[toolName].some((permission) =>
      operationalRoles.some((role: RRARole) => hasRRAPermission(role, permission)),
    ),
  );
}
