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
    Ticket,
    FileText,
    LayoutGrid,
    BarChart3,
    Cpu,
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
}

export interface AdminSidebarItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    /** Roles that can see this item. Super Admin always sees everything. */
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
    compliance_officer: "Compliance Officer",
    audit_officer: "Audit Officer",
    stock_officer: "Stock Monitoring Officer",
    correction_officer: "Correction Officer",
    reporting_officer: "Reporting & Analytics Officer",
};

export const ROLE_COLORS: Record<RRARole, string> = {
    super_admin: "bg-rose-500/10 text-rose-600 border-rose-200",
    compliance_officer: "bg-violet-500/10 text-violet-600 border-violet-200",
    audit_officer: "bg-amber-500/10 text-amber-600 border-amber-200",
    stock_officer: "bg-blue-500/10 text-blue-600 border-blue-200",
    correction_officer: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    reporting_officer: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
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
];

// ---------------------------------------------------------------------------
// Navigation groups — ordered by operational priority
// ---------------------------------------------------------------------------

export const ADMIN_SIDEBAR_GROUPS: AdminSidebarGroup[] = [
    // ── Overview ────────────────────────────────────────────
    {
        items: [
            {
                label: "Command Center",
                href: "/admin/dashboard/overview",
                icon: LayoutDashboard,
                allowedRoles: ALL,
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
                    },
                    {
                        label: "TaxFlow AI Compute",
                        href: "/admin/dashboard/ai-compute",
                        icon: Cpu,
                    },
                ],
            },
        ],
    },
    // ── Trade Operations ────────────────────────────────────
    {
        label: "Trade Operations",
        items: [
            {
                label: "Traders",
                href: "/admin/traders",
                icon: Users,
                allowedRoles: ALL,
            },
            {
                label: "Transactions",
                href: "/admin/transactions",
                icon: ArrowLeftRight,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                ],
            },
            {
                label: "Import Declarations",
                href: "/admin/imports",
                icon: Ship,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                ],
            },
            {
                label: "Supply Chain",
                href: "/admin/supply-chain",
                icon: GitBranch,
                allowedRoles: [
                    "audit_officer",
                    "stock_officer",
                ],
            },
            {
                label: "Stock Overview",
                href: "/admin/stock",
                icon: Package,
                allowedRoles: [
                    "stock_officer",
                    "audit_officer",
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
    // ── Tax & Revenue ───────────────────────────────────────
    {
        label: "Tax & Revenue",
        items: [
            {
                label: "VAT & Tax",
                href: "/admin/tax",
                icon: Receipt,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
                ],
            },
            {
                label: "Payments",
                href: "/admin/payments",
                icon: CreditCard,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
                ],
            },
            {
                label: "Tax Reports",
                href: "/admin/reports",
                icon: FileBarChart,
                allowedRoles: ["reporting_officer"],
            },
            {
                label: "Arrears Aging",
                href: "/admin/reports/arrears-aging",
                icon: Clock,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
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
                ],
            },
            {
                label: "Summary Report",
                href: "/admin/reports/summary",
                icon: FileText,
                allowedRoles: [
                    "compliance_officer",
                    "reporting_officer",
                ],
            },
        ],
    },
    // ── Enforcement ─────────────────────────────────────────
    {
        label: "Enforcement",
        items: [
            {
                label: "Disputes",
                href: "/admin/disputes",
                icon: Scale,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                ],
            },
            {
                label: "Anomaly Detection",
                href: "/admin/anomalies",
                icon: Activity,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                ],
            },
            {
                label: "VAT Verification",
                href: "/admin/vat-verification",
                icon: TrendingUp,
                allowedRoles: [
                    "compliance_officer",
                    "audit_officer",
                ],
            },
            {
                label: "Compliance",
                href: "/admin/compliance",
                icon: Gavel,
                allowedRoles: ["compliance_officer"],
            },
            {
                label: "Compliance Alerts",
                href: "/admin/compliance-alerts",
                icon: Shield,
                allowedRoles: ["compliance_officer"],
            },
            {
                label: "Payment Reminders",
                href: "/admin/payment-reminders",
                icon: Bell,
                allowedRoles: ["compliance_officer"],
            },
            {
                label: "Support Tickets",
                href: "/admin/support",
                icon: Ticket,
                allowedRoles: ALL,
            },
        ],
    },
    // ── Administration ──────────────────────────────────────
    {
        label: "Administration",
        items: [
            {
                label: "Audit Trail",
                href: "/admin/audit",
                icon: ScrollText,
                allowedRoles: ["audit_officer"],
            },
            {
                label: "Data Exports",
                href: "/admin/exports",
                icon: Download,
                allowedRoles: ["reporting_officer"],
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
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter sidebar groups by role.
 * Super Admin sees everything. Other roles see only their allowed items.
 */
export function getAdminSidebarGroups(role: string): AdminSidebarGroup[] {
    return ADMIN_SIDEBAR_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
            (item) =>
                role === "super_admin" ||
                item.allowedRoles.includes(role as RRARole),
        ),
    })).filter((group) => group.items.length > 0);
}

/**
 * Flat list of all visible items for a role.
 */
export function getAdminSidebarItems(role: string): AdminSidebarItem[] {
    return getAdminSidebarGroups(role).flatMap((g) => g.items);
}
