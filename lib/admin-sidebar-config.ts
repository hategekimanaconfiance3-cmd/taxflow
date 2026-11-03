import {
    LayoutDashboard,
    Users,
    ArrowLeftRight,
    Receipt,
    ScrollText,
    Ship,
    Scale,
    Shield,
    Settings,
    HelpCircle,
    Bell,
    FileBarChart,
    UserCheck,
    Gavel,
    Activity,
    TrendingUp,
    CreditCard,
    GitBranch,
    Package,
    Download,
    UserSearch,
    Clock,
    Database,
    Target,
    Megaphone,
    MessageSquare,
    FileText,
    LayoutGrid,
    BarChart3,
    Cpu,
    Brain,
    Layers,
    ShieldAlert,
    UserCog,
    Lock,
    Server,
    Eye,
} from "lucide-react";
import type { RRARole } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { RRARole };

export interface AdminSidebarChild {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    allowedRoles?: RRARole[];
}

export interface AdminSidebarItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    /** Explicit role allowlist. An administrator does not implicitly bypass it. */
    allowedRoles: RRARole[];
    /** Sub-items rendered indented below this item in the sidebar. */
    children?: AdminSidebarChild[];
}

export interface AdminSidebarGroup {
    label?: string;
    items: AdminSidebarItem[];
}

// ---------------------------------------------------------------------------
// Role labels and colors
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<RRARole, string> = {
    super_admin: "Super Admin",
    director_executive: "RRA Director / Executive",
    tax_compliance_officer: "Tax Compliance Officer",
    audit_investigation_officer: "Audit & Investigation Officer",
    product_traceability_officer: "Product Traceability Officer",
    customs_import_officer: "Customs & Import Officer",
    payments_reconciliation_officer: "Tax Payments & Reconciliation Officer",
    data_ai_analyst: "Data & AI Intelligence Analyst",
    compliance_officer: "Compliance Officer",
    audit_officer: "Audit Officer",
    stock_officer: "Stock Monitoring Officer",
    correction_officer: "Correction Officer",
    reporting_officer: "Reporting & Analytics Officer",
    stock_control_admin: "Stock Control Administrator",
};

export const ROLE_COLORS: Record<RRARole, string> = {
    director_executive: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
    tax_compliance_officer: "bg-violet-500/10 text-violet-700 border-violet-200",
    audit_investigation_officer: "bg-amber-500/10 text-amber-700 border-amber-200",
    product_traceability_officer: "bg-blue-500/10 text-blue-700 border-blue-200",
    customs_import_officer: "bg-orange-500/10 text-orange-700 border-orange-200",
    payments_reconciliation_officer: "bg-green-500/10 text-green-700 border-green-200",
    data_ai_analyst: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
    super_admin: "bg-rose-500/10 text-rose-600 border-rose-200",
    compliance_officer: "bg-violet-500/10 text-violet-600 border-violet-200",
    audit_officer: "bg-amber-500/10 text-amber-600 border-amber-200",
    stock_officer: "bg-blue-500/10 text-blue-600 border-blue-200",
    correction_officer: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    reporting_officer: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
    stock_control_admin: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
};

// ---------------------------------------------------------------------------
// All roles shorthand
// ---------------------------------------------------------------------------

const ALL: RRARole[] = [
    "super_admin",
    "compliance_officer",
    "audit_officer",
    "stock_officer",
    "correction_officer",
    "reporting_officer",
    "tax_compliance_officer",
    "audit_investigation_officer",
    "product_traceability_officer",
    "customs_import_officer",
    "payments_reconciliation_officer",
    "data_ai_analyst",
    "director_executive",
];

// System-admin access does not itself grant access to confidential taxpayer data.
const TAXPAYER_SEARCH_ROLES = ALL.filter((role) => role !== "super_admin");

// ---------------------------------------------------------------------------
// Navigation groups -- ordered by operational priority
// ---------------------------------------------------------------------------

export const ADMIN_SIDEBAR_GROUPS: AdminSidebarGroup[] = [
    // -- Overview
    {
        items: [
            {
                label: "Command Center",
                href: "/admin/dashboard/overview",
                icon: LayoutDashboard,
                allowedRoles: ["super_admin", "director_executive"],
                children: [
                    {
                        label: "Overview",
                        href: "/admin/dashboard/overview",
                        icon: LayoutGrid,
                    },
                    {
                        label: "Analytics",
                        href: "/admin/dashboard/analytics",
                        icon: BarChart3,
                        allowedRoles: ["reporting_officer", "director_executive", "data_ai_analyst"],
                    },
                    {
                        label: "TaxFlow AI Compute",
                        href: "/admin/dashboard/ai-compute",
                        icon: Cpu,
                        allowedRoles: ["data_ai_analyst"],
                    },
                ],
            },
        ],
    },
    // -- Trade Operations
    {
        label: "Trade Operations",
        items: [
            {
                label: "Traders",
                href: "/admin/traders",
                icon: Users,
                allowedRoles: TAXPAYER_SEARCH_ROLES,
            },
            {
                label: "Taxpayer Corrections",
                href: "/admin/corrections",
                icon: UserCheck,
                allowedRoles: ["correction_officer", "super_admin"],
            },
            {
                label: "Transactions",
                href: "/admin/transactions",
                icon: ArrowLeftRight,
                allowedRoles: [
                    "super_admin",
                    "audit_officer",
                    "audit_investigation_officer",
                ],
            },
            {
                label: "Import Declarations",
                href: "/admin/imports",
                icon: Ship,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                    "customs_import_officer",
                ],
            },
            {
                label: "Manufacturing Material Review",
                href: "/admin/production/material-accounting",
                icon: Package,
                allowedRoles: ["customs_import_officer", "stock_control_admin"],
            },
            {
                label: "Supply Chain",
                href: "/admin/supply-chain",
                icon: GitBranch,
                allowedRoles: [
                    "audit_officer",
                    "stock_officer",
                    "audit_investigation_officer",
                    "product_traceability_officer",
                    "director_executive",
                    "data_ai_analyst",
                ],
            },
            {
                label: "Product Journey",
                href: "/admin/product-journey",
                icon: GitBranch,
                allowedRoles: [
                    "audit_officer",
                    "stock_officer",
                    "audit_investigation_officer",
                    "product_traceability_officer",
                ],
            },
            {
                label: "Stock Overview",
                href: "/admin/stock",
                icon: Package,
                allowedRoles: [
                    "stock_officer",
                    "audit_officer",
                    "correction_officer",
                    "product_traceability_officer",
                    "audit_investigation_officer",
                ],
            },
            {
                label: "Taxpayer Discovery",
                href: "/admin/intelligence/unregistered",
                icon: UserSearch,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                ],
            },
        ],
    },
    // -- Tax & Revenue
    {
        label: "Tax & Revenue",
        items: [
            {
                label: "VAT & Tax",
                href: "/admin/tax",
                icon: Receipt,
                allowedRoles: [
                    "super_admin",
                    "compliance_officer",
                    "reporting_officer",
                    "payments_reconciliation_officer",
                ],
            },
            {
                label: "Payments",
                href: "/admin/payments",
                icon: CreditCard,
                allowedRoles: [
                    "super_admin",
                    "compliance_officer",
                    "audit_officer",
                    "reporting_officer",
                    "tax_compliance_officer",
                    "payments_reconciliation_officer",
                ],
            },
            {
                label: "Tax Reports",
                href: "/admin/reports",
                icon: FileBarChart,
                allowedRoles: ["reporting_officer", "director_executive", "data_ai_analyst"],
            },
            {
                label: "Arrears Aging",
                href: "/admin/reports/arrears-aging",
                icon: Clock,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
                    "director_executive",
                    "data_ai_analyst",
                ],
            },
            {
                label: "KPI Targets",
                href: "/admin/reports/kpi-targets",
                icon: Target,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
                ],
            },
            {
                label: "Data Quality",
                href: "/admin/reports/data-quality",
                icon: Database,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                    "data_ai_analyst",
                ],
            },
            {
                label: "Summary Report",
                href: "/admin/reports/summary",
                icon: FileText,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
                    "director_executive",
                    "data_ai_analyst",
                ],
            },
        ],
    },
    // -- Enforcement
    {
        label: "Enforcement",
        items: [
            {
                label: "Disputes",
                href: "/admin/disputes",
                icon: Scale,
                allowedRoles: [
                    "super_admin",
                    "compliance_officer",
                    "audit_officer",
                    "tax_compliance_officer",
                    "audit_investigation_officer",
                ],
            },
            {
                label: "Intelligence Hub",
                href: "/admin/intelligence",
                icon: Brain,
                allowedRoles: [
                    "super_admin",
                    "compliance_officer",
                    "audit_officer",
                    "data_ai_analyst",
                ],
                children: [
                    {
                        label: "Intelligence Hub",
                        href: "/admin/intelligence",
                        icon: Brain,
                        allowedRoles: [
                            "compliance_officer",
                            "audit_officer",
                            "tax_compliance_officer",
                            "audit_investigation_officer",
                            "data_ai_analyst",
                        ],
                    },
                    {
                        label: "All Findings",
                        href: "/admin/intelligence/findings",
                        icon: Layers,
                        allowedRoles: [
                            "compliance_officer",
                            "audit_officer",
                            "tax_compliance_officer",
                            "audit_investigation_officer",
                            "data_ai_analyst",
                        ],
                    },
                    {
                        label: "Unregistered Taxpayers",
                        href: "/admin/intelligence/unregistered",
                        icon: UserSearch,
                        allowedRoles: [
                            "compliance_officer",
                            "audit_officer",
                            "tax_compliance_officer",
                            "audit_investigation_officer",
                        ],
                    },
                    {
                        label: "AI Assistant",
                        href: "/admin/intelligence/assistant",
                        icon: Brain,
                        allowedRoles: [
                            "compliance_officer",
                            "audit_officer",
                            "stock_officer",
                            "reporting_officer",
                            "tax_compliance_officer",
                            "audit_investigation_officer",
                            "product_traceability_officer",
                            "customs_import_officer",
                            "payments_reconciliation_officer",
                            "data_ai_analyst",
                            "director_executive",
                        ],
                    },
                ],
            },
            {
                label: "AI Assistant",
                href: "/admin/intelligence/assistant",
                icon: Brain,
                allowedRoles: ["correction_officer"],
            },
            {
                label: "Anomaly Detection",
                href: "/admin/anomalies",
                icon: Activity,
                allowedRoles: [
                    "super_admin",
                    "audit_officer",
                    "audit_investigation_officer",
                ],
            },
            {
                label: "VAT Verification",
                href: "/admin/vat-verification",
                icon: TrendingUp,
                allowedRoles: [
                    "super_admin",
                    "compliance_officer",
                    "audit_officer",
                    "tax_compliance_officer",
                    "audit_investigation_officer",
                ],
            },
            {
                label: "Compliance",
                href: "/admin/compliance",
                icon: Gavel,
                allowedRoles: ["super_admin", "compliance_officer", "tax_compliance_officer"],
            },
            {
                label: "Compliance Alerts",
                href: "/admin/compliance-alerts",
                icon: Shield,
                allowedRoles: ["compliance_officer", "tax_compliance_officer"],
            },
            {
                label: "Payment Reminders",
                href: "/admin/payment-reminders",
                icon: Bell,
                allowedRoles: ["compliance_officer", "tax_compliance_officer"],
            },
            {
                label: "Messages",
                href: "/admin/messages",
                icon: MessageSquare,
                allowedRoles: ["super_admin", "director_executive", "tax_compliance_officer", "audit_investigation_officer", "product_traceability_officer", "customs_import_officer", "payments_reconciliation_officer", "compliance_officer", "audit_officer", "stock_officer", "correction_officer", "reporting_officer"],
            },
        ],
    },
    // -- Administration
    {
        label: "Administration",
        items: [
            {
                label: "KPI Targets",
                href: "/admin/kpi",
                icon: Target,
                allowedRoles: ["super_admin"],
            },
            {
                label: "Audit Trail",
                href: "/admin/audit",
                icon: ScrollText,
                allowedRoles: ["audit_officer", "audit_investigation_officer", "super_admin"],
            },
            {
                label: "Data Exports",
                href: "/admin/exports",
                icon: Download,
                allowedRoles: [
                    "super_admin",
                    "reporting_officer",
                    "director_executive",
                    "data_ai_analyst",
                ],
            },
            {
                label: "AI Feedback Review",
                href: "/admin/intelligence/feedback",
                icon: Brain,
                allowedRoles: ["data_ai_analyst"],
            },
            {
                label: "Notifications",
                href: "/admin/notifications",
                icon: Bell,
                allowedRoles: ALL,
            },
            {
                label: "Bulletin Board",
                href: "/admin/notifications/bulletin",
                icon: Megaphone,
                allowedRoles: ALL,
            },
            {
                label: "Settings",
                href: "/admin/settings",
                icon: Settings,
                allowedRoles: ["super_admin"],
            },
        ],
    },

    // -- Super Admin Control Plane
    {
        label: "Super Admin",
        items: [
            {
                label: "Control Plane",
                href: "/admin/super",
                icon: ShieldAlert,
                allowedRoles: ["super_admin"],
                children: [
                    {
                        label: "Overview",
                        href: "/admin/super",
                        icon: Eye,
                        allowedRoles: ["super_admin"],
                    },
                    {
                        label: "Admin Management",
                        href: "/admin/super/admins",
                        icon: UserCog,
                        allowedRoles: ["super_admin"],
                    },
                    {
                        label: "Security Center",
                        href: "/admin/super/security",
                        icon: Lock,
                        allowedRoles: ["super_admin"],
                    },
                    {
                        label: "System Health",
                        href: "/admin/super/system",
                        icon: Server,
                        allowedRoles: ["super_admin"],
                    },
                    {
                        label: "Top Taxpayers",
                        href: "/admin/super/taxpayers",
                        icon: TrendingUp,
                        allowedRoles: ["super_admin"],
                    },
                    {
                        label: "Audit Explorer",
                        href: "/admin/super/audit",
                        icon: Eye,
                        allowedRoles: ["super_admin"],
                    },
                ],
            },
        ],
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter sidebar groups by role.
 * Each role sees only explicitly allowed items; there is no implicit admin bypass.
 */
export function getAdminSidebarGroups(roles: string | string[]): AdminSidebarGroup[] {
    const assignedRoles = Array.isArray(roles) ? roles : [roles];
    return ADMIN_SIDEBAR_GROUPS.map((group) => ({
        ...group,
        items: group.items
            .filter((item) =>
                assignedRoles.some((role) => item.allowedRoles.includes(role as RRARole))
            )
            .map((item) => ({
                ...item,
                children: item.children?.filter(
                    (child) =>
                        !child.allowedRoles ||
                        assignedRoles.some((role) =>
                            child.allowedRoles!.includes(role as RRARole)
                        )
                ),
            })),
    })).filter((group) => group.items.length > 0);
}

/**
 * Flat list of all visible items for a role.
 */
export function getAdminSidebarItems(roles: string | string[]): AdminSidebarItem[] {
    return getAdminSidebarGroups(roles).flatMap((g) => g.items);
}

/** Navigation destinations available to the supplied active RRA role set. */
export function getAdminNavigationLinks(roles: string | string[]): Array<{ label: string; href: string }> {
    return getAdminSidebarGroups(roles).flatMap((group) =>
        group.items.flatMap((item) => [
            { label: item.label, href: item.href },
            ...(item.children ?? []).map((child) => ({ label: child.label, href: child.href })),
        ]),
    );
}
