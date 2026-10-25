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
    "stock.correction.review", "support.read", "support.manage",
    "taxpayer.profile.update", "taxpayer.clearance.update",
] as const;
export type RRAPermission = (typeof RRA_PERMISSIONS)[number];

const PROPOSED_ROLE_PERMISSIONS: Record<RRAProposedRole, readonly RRAPermission[]> = {
    super_admin: RRA_PERMISSIONS,
    director_executive: ["dashboard.executive.read", "reports.aggregate.read", "supply_chain.summary.read", "ai.assistant.use", "taxpayer.intelligence.search"],
    tax_compliance_officer: ["taxpayer.intelligence.search", "taxpayer.compliance.read", "tax.records.read", "payments.read", "compliance.followup.manage", "support.read", "support.manage", "ai.assistant.use", "taxpayer.profile.update", "taxpayer.clearance.update"],
    audit_investigation_officer: ["taxpayer.intelligence.search", "investigation.case.manage", "transaction.read", "audit.trail.read", "traceability.read", "ai.assistant.use"],
    product_traceability_officer: ["taxpayer.intelligence.search", "traceability.read", "stock.read", "ai.assistant.use"],
    customs_import_officer: ["taxpayer.intelligence.search", "imports.read", "imports.review", "ai.assistant.use"],
    payments_reconciliation_officer: ["taxpayer.intelligence.search", "tax.records.read", "payments.read", "payments.reconcile", "ai.assistant.use"],
    data_ai_analyst: ["taxpayer.intelligence.search", "analytics.read", "ai.findings.read", "data_quality.read", "reports.aggregate.read", "ai.assistant.use", "ai.feedback.review"],
};

const LEGACY_ROLE_PERMISSIONS: Record<(typeof LEGACY_RRA_ROLES)[number], readonly RRAPermission[]> = {
    compliance_officer: ["taxpayer.intelligence.search", "taxpayer.compliance.read", "tax.records.read", "payments.read", "compliance.followup.manage", "imports.review", "support.read", "support.manage", "ai.assistant.use", "taxpayer.profile.update", "taxpayer.clearance.update"],
    audit_officer: ["taxpayer.intelligence.search", "investigation.case.manage", "transaction.read", "audit.trail.read", "traceability.read", "imports.read", "imports.review", "ai.assistant.use"],
    stock_officer: ["taxpayer.intelligence.search", "traceability.read", "stock.read", "ai.assistant.use"],
    correction_officer: ["taxpayer.intelligence.search", "stock.read", "stock.correction.review"],
    reporting_officer: ["taxpayer.intelligence.search", "reports.aggregate.read", "analytics.read", "tax.records.read", "payments.read", "support.read", "ai.assistant.use"],
};

export const RRA_ROLE_PERMISSIONS: Record<RRARole | "super_admin", readonly RRAPermission[]> = {
    ...PROPOSED_ROLE_PERMISSIONS,
    ...LEGACY_ROLE_PERMISSIONS,
    super_admin: RRA_PERMISSIONS,
};

/** Compatibility for old route checks; super_admin is deliberately not an all-role bypass. */
const LEGACY_GUARD_ALIASES: Partial<Record<RRAProposedRole, readonly string[]>> = {
    super_admin: ["super_admin"],
    tax_compliance_officer: ["compliance_officer"],
    audit_investigation_officer: ["audit_officer"],
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

/** Permission evaluation for server-guarded operational modules, including the full super_admin grant. */
export function hasOperationalRRAPermission(roles: readonly RRARole[], permission: RRAPermission): boolean {
    return roles.some((role) => hasRRAPermission(role, permission));
}

export function hasAnyOperationalRRAPermission(roles: readonly RRARole[], permissions: readonly RRAPermission[]): boolean {
    return permissions.some((permission) => hasOperationalRRAPermission(roles, permission));
}

export function getOperationalRRARolesWithAnyPermission(permissions: readonly RRAPermission[]): RRARole[] {
    return RRA_ROLE_VALUES.filter((role) => permissions.some((permission) => hasRRAPermission(role, permission)));
}

export function getRRAProposedRoleLabel(role: string): string {
    return RRA_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}
