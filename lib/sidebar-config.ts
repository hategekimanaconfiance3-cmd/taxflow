import {
    LayoutDashboard,
    Package,
    Factory,
    ShoppingCart,
    ShoppingBag,
    ArrowLeftRight,
    Receipt,
    Clock,
    Settings,
    FileText,
    CreditCard,
    RefreshCw,
    Search,
    History,
    HelpCircle,
    MessageSquare,
    Bell,
    Ship,
    Shield,
    Brain,
    UsersRound,
    ClipboardList,
} from "lucide-react";

export type TraderRole = "manufacturer" | "wholesaler" | "retailer";

export interface SidebarItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    roles: TraderRole[] | "all";
}

export interface SidebarGroup {
    label?: string;
    items: SidebarItem[];
}

/**
 * Sidebar navigation grouped into logical sections.
 * Each group is separated by a divider in the UI.
 */
export const SIDEBAR_GROUPS: SidebarGroup[] = [
    // ── Core ─────────────────────────────────────────────────
    {
        items: [
            {
                label: "Dashboard",
                href: "/dashboard",
                icon: LayoutDashboard,
                roles: "all",
            },
            {
                label: "Inventory",
                href: "/dashboard/inventory",
                icon: Package,
                roles: "all",
            },
            {
                label: "Customers",
                href: "/dashboard/customers",
                icon: UsersRound,
                roles: "all",
            },
            {
                label: "Transactions",
                href: "/dashboard/transactions",
                icon: ArrowLeftRight,
                roles: "all",
            },
            {
                label: "Pending",
                href: "/dashboard/pending",
                icon: Clock,
                roles: "all",
            },
            {
                label: "Sales History",
                href: "/dashboard/sales",
                icon: History,
                roles: "all",
            },
            {
                label: "Notifications",
                href: "/dashboard/notifications",
                icon: Bell,
                roles: "all",
            },
            {
                label: "AI Assistant",
                href: "/dashboard/assistant",
                icon: Brain,
                roles: "all",
            },
            {
                label: "Tax Intelligence",
                href: "/dashboard/intelligence",
                icon: Shield,
                roles: "all",
            },
        ],
    },
    // ── Operations ───────────────────────────────────────────
    {
        label: "Operations",
        items: [
            {
                label: "Production Entry",
                href: "/dashboard/production",
                icon: Factory,
                roles: ["manufacturer"],
            },
            {
                label: "Sell to Buyer",
                href: "/dashboard/sell",
                icon: ShoppingCart,
                roles: ["manufacturer", "wholesaler"],
            },
            {
                label: "Record Sale",
                href: "/dashboard/record-sale",
                icon: ShoppingBag,
                roles: ["retailer"],
            },
            {
                label: "Restock Requests",
                href: "/dashboard/restock",
                icon: ClipboardList,
                roles: "all",
            },
            {
                label: "Imports",
                href: "/dashboard/imports",
                icon: Ship,
                roles: ["manufacturer", "wholesaler"],
            },
            {
                label: "Disputes",
                href: "/dashboard/disputes",
                icon: Shield,
                roles: "all",
            },
        ],
    },
    // ── Finance ──────────────────────────────────────────────
    {
        label: "Finance",
        items: [
            {
                label: "Tax Report",
                href: "/dashboard/tax",
                icon: Receipt,
                roles: "all",
            },
            {
                label: "Payments & VAT",
                href: "/dashboard/payments",
                icon: CreditCard,
                roles: "all",
            },
            {
                label: "Export Report",
                href: "/dashboard/tax?export=pdf",
                icon: FileText,
                roles: "all",
            },
        ],
    },
    // ── System ───────────────────────────────────────────────
    {
        label: "System",
        items: [
            {
                label: "Settings",
                href: "/dashboard/settings",
                icon: Settings,
                roles: "all",
            },
            {
                label: "Messages",
                href: "/dashboard/messages",
                icon: MessageSquare,
                roles: "all",
            },
        ],
    },
];

/**
 * Filter sidebar groups based on the current user's role.
 * Groups with no visible items are removed entirely.
 */
export function getSidebarGroups(role: TraderRole): SidebarGroup[] {
    return SIDEBAR_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
            (item) => item.roles === "all" || item.roles.includes(role),
        ),
    })).filter((group) => group.items.length > 0);
}

/**
 * Flat list of all sidebar items for a role (used by mobile menu).
 */
export function getSidebarItems(role: TraderRole): SidebarItem[] {
    return getSidebarGroups(role).flatMap((g) => g.items);
}

/**
 * Role display labels.
 */
export const ROLE_LABELS: Record<TraderRole, string> = {
    manufacturer: "Manufacturer",
    wholesaler: "Wholesaler",
    retailer: "Retailer",
};

/**
 * Role badge colors.
 */
export const ROLE_COLORS: Record<TraderRole, string> = {
    manufacturer: "bg-blue-500/10 text-blue-600 border-blue-200",
    wholesaler: "bg-amber-500/10 text-amber-600 border-amber-200",
    retailer: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
};

export { Search as SearchIcon };
