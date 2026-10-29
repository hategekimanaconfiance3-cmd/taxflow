/** Proposed application roles. They are configurable role labels, not official RRA titles. */
export const RRA_ROLE_OPTIONS = [
    { value: "super_admin", label: "RRA Super Administrator" },
    { value: "director_executive", label: "RRA Director / Executive" },
    { value: "tax_compliance_officer", label: "Tax Compliance Officer" },
    { value: "audit_investigation_officer", label: "Audit & Investigation Officer" },
    { value: "product_traceability_officer", label: "Product Traceability Officer" },
    { value: "customs_import_officer", label: "Customs & Import Officer" },
    { value: "payments_reconciliation_officer", label: "Tax Payments & Reconciliation Officer" },
    { value: "data_ai_analyst", label: "Data & AI Intelligence Analyst" },
    { value: "stock_control_admin", label: "Stock Control Administrator" },
] as const;

export const LEGACY_RRA_ROLES = [
    "compliance_officer",
    "audit_officer",
    "stock_officer",
    "correction_officer",
    "reporting_officer",
] as const;

export const RRA_ROLE_VALUES = [...RRA_ROLE_OPTIONS.map((role) => role.value), ...LEGACY_RRA_ROLES] as const;
export type RRARole = (typeof RRA_ROLE_VALUES)[number];
export type RRAProposedRole = (typeof RRA_ROLE_OPTIONS)[number]["value"];

export const RRA_PERMISSIONS = [
    "staff.manage", "system.configure", "security.audit.read", "dashboard.executive.read",
    "reports.aggregate.read", "supply_chain.summary.read", "taxpayer.intelligence.search", "taxpayer.compliance.read",
    "tax.records.read", "compliance.followup.manage", "investigation.case.manage",
    "transaction.read", "audit.trail.read", "traceability.read", "stock.read",
    "imports.read", "imports.review", "payments.read", "payments.reconcile",
    "analytics.read", "ai.findings.read", "data_quality.read", "ai.assistant.use", "ai.feedback.review",
    "stock.correction.review", "support.manage", "communications.staff.use", "production.formula.read", "production.material.receipt.review", "production.batch.review", "production.material.adjust", "stock.threshold.read", "stock.threshold.manage.global",
    "stock.threshold.manage.scoped", "stock.restock.read", "stock.restock.exception.review", "stock.restock.baseline.attest",
] as const;
export type RRAPermission = (typeof RRA_PERMISSIONS)[number];

const PROPOSED_ROLE_PERMISSIONS: Record<RRAProposedRole, readonly RRAPermission[]> = {
    super_admin: ["staff.manage", "system.configure", "security.audit.read", "reports.aggregate.read", "dashboard.executive.read", "taxpayer.compliance.read", "tax.records.read", "investigation.case.manage", "transaction.read", "audit.trail.read", "traceability.read", "stock.read", "imports.read", "imports.review", "payments.read", "payments.reconcile", "analytics.read", "ai.findings.read", "data_quality.read", "ai.assistant.use", "ai.feedback.review", "stock.correction.review", "compliance.followup.manage", "support.manage", "communications.staff.use", "supply_chain.summary.read", "stock.threshold.read", "stock.threshold.manage.global", "stock.threshold.manage.scoped", "stock.restock.read", "stock.restock.exception.review", "stock.restock.baseline.attest"],
    director_executive: ["dashboard.executive.read", "reports.aggregate.read", "supply_chain.summary.read", "ai.assistant.use", "taxpayer.intelligence.search", "communications.staff.use"],
    tax_compliance_officer: ["taxpayer.intelligence.search", "taxpayer.compliance.read", "tax.records.read", "payments.read", "compliance.followup.manage", "support.manage", "ai.assistant.use", "communications.staff.use"],
    audit_investigation_officer: ["taxpayer.intelligence.search", "investigation.case.manage", "transaction.read", "audit.trail.read", "traceability.read", "production.formula.read", "ai.assistant.use", "communications.staff.use"],
    product_traceability_officer: ["taxpayer.intelligence.search", "traceability.read", "stock.read", "ai.assistant.use", "communications.staff.use"],
    customs_import_officer: ["taxpayer.intelligence.search", "imports.read", "imports.review", "production.material.receipt.review", "ai.assistant.use", "communications.staff.use"],
    payments_reconciliation_officer: ["taxpayer.intelligence.search", "tax.records.read", "payments.read", "payments.reconcile", "ai.assistant.use", "communications.staff.use"],
    data_ai_analyst: ["taxpayer.intelligence.search", "analytics.read", "ai.findings.read", "data_quality.read", "reports.aggregate.read", "ai.assistant.use", "ai.feedback.review"],
    stock_control_admin: ["stock.threshold.read", "stock.threshold.manage.scoped", "stock.restock.read", "stock.restock.exception.review", "stock.restock.baseline.attest", "production.material.receipt.review", "production.batch.review", "production.material.adjust"],
};

const LEGACY_ROLE_PERMISSIONS: Record<(typeof LEGACY_RRA_ROLES)[number], readonly RRAPermission[]> = {
    compliance_officer: ["taxpayer.intelligence.search", "taxpayer.compliance.read", "tax.records.read", "payments.read", "compliance.followup.manage", "imports.review", "support.manage", "ai.assistant.use", "communications.staff.use"],
    audit_officer: ["taxpayer.intelligence.search", "investigation.case.manage", "transaction.read", "audit.trail.read", "traceability.read", "production.formula.read", "imports.read", "imports.review", "ai.assistant.use", "communications.staff.use"],
    stock_officer: ["taxpayer.intelligence.search", "traceability.read", "stock.read", "ai.assistant.use", "communications.staff.use"],
    correction_officer: ["taxpayer.intelligence.search", "stock.read", "stock.correction.review", "communications.staff.use"],
    reporting_officer: ["taxpayer.intelligence.search", "reports.aggregate.read", "analytics.read", "tax.records.read", "payments.read", "ai.assistant.use", "communications.staff.use"],
};

export const RRA_ROLE_PERMISSIONS: Record<RRARole | "super_admin", readonly RRAPermission[]> = {
    ...PROPOSED_ROLE_PERMISSIONS,
    ...LEGACY_ROLE_PERMISSIONS,
    super_admin: PROPOSED_ROLE_PERMISSIONS.super_admin,
};

/** Compatibility for old route checks; super_admin is deliberately not an all-role bypass. */
const LEGACY_GUARD_ALIASES: Partial<Record<RRAProposedRole, readonly string[]>> = {
    super_admin: ["super_admin"],
    // Product traceability has the exact same legacy stock-read permission set.
    product_traceability_officer: ["stock_officer"],
};

export function isRRARole(value: string): value is RRARole | "super_admin" {
    return (RRA_ROLE_VALUES as readonly string[]).includes(value) || value === "super_admin";
}

export function isRRARoleAllowed(role: RRARole | "super_admin", allowedRoles: readonly string[]): boolean {
    if (allowedRoles.length === 0) return true;
    if (allowedRoles.includes(role)) return true;
    const aliases = LEGACY_GUARD_ALIASES[role as RRAProposedRole] ?? [];
    return aliases.some((alias) => allowedRoles.includes(alias));
}

export function hasRRAPermission(role: RRARole | "super_admin", permission: RRAPermission): boolean {
    return RRA_ROLE_PERMISSIONS[role].includes(permission);
}

export function getRRAProposedRoleLabel(role: string): string {
    return RRA_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}
