"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    getAdminSidebarGroups,
    ROLE_LABELS,
    ROLE_COLORS,
    type RRARole,
} from "@/lib/admin-sidebar-config";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
    LogOut,
    Menu,
    Shield,
    Bell,
    ChevronDown,
    User,
    HelpCircle,
    Search,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { searchTraders } from "@/lib/actions/admin-search.action";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";

interface AdminShellProps {
    userName: string;
    staffId: string;
    clearanceLevel: string;
    children: React.ReactNode;
}

export function AdminShell({
    userName,
    staffId,
    clearanceLevel,
    children,
}: AdminShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const groups = getAdminSidebarGroups(clearanceLevel);

    // Build command palette items from admin sidebar config
    const commandItems: CommandItem[] = useMemo(
        () =>
            groups.flatMap((group) =>
                group.items.map((item) => ({
                    label: item.label,
                    href: item.href,
                    icon: item.icon,
                    group: group.label || "Overview",
                }))
            ),
        [groups]
    );

    const [searchFocused, setSearchFocused] = useState(false);

    const initials = userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    // Collect all sidebar hrefs for smarter active-state detection
    const allHrefs = useMemo(
        () => groups.flatMap((g) => g.items.map((i) => i.href)),
        [groups]
    );

    function isActive(href: string): boolean {
        const cleanPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
        const cleanHref = href.endsWith("/") ? href.slice(0, -1) : href;

        // Dashboard is exact-match only
        if (cleanHref === "/admin/dashboard") return cleanPathname === "/admin/dashboard";
        // Action triggers with query params are never active
        if (cleanHref.includes("?")) return false;
        // Exact match always wins
        if (cleanPathname === cleanHref) return true;
        // For startsWith matches, only activate if no OTHER sidebar item
        // is a more specific (longer) prefix match for the current pathname
        if (cleanPathname.startsWith(cleanHref + "/")) {
            const hasMoreSpecificSibling = allHrefs.some((other) => {
                const cleanOther = other.endsWith("/") ? other.slice(0, -1) : other;
                return (
                    cleanOther !== cleanHref &&
                    cleanOther.length > cleanHref.length &&
                    cleanPathname.startsWith(cleanOther)
                );
            });
            return !hasMoreSpecificSibling;
        }
        return false;
    }

    const SidebarNav = () => (
        <>
            {/* ── Logo ─────────────────────────────── */}
            <div className="flex h-14 items-center gap-2.5 px-5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
                    RRA
                </div>
                <div className="flex flex-col">
                    <span className="text-[15px] font-semibold tracking-tight leading-tight">
                        TaxFlow
                    </span>
                    <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
                        Administration
                    </span>
                </div>
            </div>

            {/* ── Search trigger ───────────────────── */}
            <div className="px-3 pb-2">
                <button
                    onClick={() => {
                        document.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md border border-border/60 px-3 py-[7px] text-sm transition-colors hover:bg-accent/50"
                >
                    <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
                    <span className="flex-1 text-left text-muted-foreground/70 text-[13px]">
                        Find...
                    </span>
                    <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                        F
                    </kbd>
                </button>
            </div>

            <Separator className="opacity-60" />

            {/* ── Navigation groups ─────────────────── */}
            <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
                {groups.map((group, gi) => (
                    <div key={gi}>
                        {/* Group label */}
                        {group.label && (
                            <div className="px-5 pt-4 pb-1.5">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                    {group.label}
                                </span>
                            </div>
                        )}

                        {/* Items */}
                        <div className="px-2 space-y-[2px]">
                            {group.items.map((item) => {
                                const active = isActive(item.href);
                                return (
                                    <Tooltip key={item.href}>
                                        <TooltipTrigger asChild>
                                            <Link
                                                href={item.href}
                                                className={cn(
                                                    "group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-all duration-150",
                                                    active
                                                        ? "bg-accent text-foreground"
                                                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                                )}
                                            >
                                                {/* Active indicator bar */}
                                                {active && (
                                                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-foreground" />
                                                )}
                                                <item.icon
                                                    className={cn(
                                                        "h-4 w-4 shrink-0 transition-colors",
                                                        active
                                                            ? "text-foreground"
                                                            : "text-muted-foreground/70 group-hover:text-foreground",
                                                    )}
                                                />
                                                {item.label}
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="text-xs"
                                        >
                                            {item.label}
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </div>

                        {/* Divider between groups (except last) */}
                        {gi < groups.length - 1 && (
                            <Separator className="my-2 opacity-60" />
                        )}
                    </div>
                ))}
            </nav>

            {/* ── System status ─────────────────────── */}
            <div className="px-5 py-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    System Online
                </div>
            </div>

            <Separator className="opacity-60" />

            {/* ── User section ─────────────────────── */}
            <div className="p-3">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                            <Avatar className="h-7 w-7 border border-border/60">
                                <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium truncate leading-none">
                                    {userName}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[9px] px-1 py-0 font-semibold",
                                            ROLE_COLORS[
                                            clearanceLevel as RRARole
                                            ] || "",
                                        )}
                                    >
                                        <Shield className="h-2.5 w-2.5 mr-0.5" />
                                        {ROLE_LABELS[
                                            clearanceLevel as RRARole
                                        ] ?? clearanceLevel}
                                    </Badge>
                                </div>
                            </div>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="top"
                        align="start"
                        className="w-[232px]"
                    >
                        <div className="px-2 py-2">
                            <p className="text-sm font-medium truncate">
                                {userName}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                {staffId}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] px-1.5 py-0",
                                        ROLE_COLORS[
                                        clearanceLevel as RRARole
                                        ] || "",
                                    )}
                                >
                                    {ROLE_LABELS[
                                        clearanceLevel as RRARole
                                    ] ?? clearanceLevel}
                                </Badge>
                            </div>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <User className="mr-2 h-3.5 w-3.5" />
                            Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <HelpCircle className="mr-2 h-3.5 w-3.5" />
                            Help & Support
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => router.push("/admin-login")}
                            className="text-destructive focus:text-destructive"
                        >
                            <LogOut className="mr-2 h-3.5 w-3.5" />
                            Sign Out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </>
    );

    return (
        <TooltipProvider delayDuration={300}>
            <div className="min-h-screen bg-background">
                {/* Command Palette (F to open) */}
                <CommandPalette items={commandItems} portalLabel="RRA Admin" />

                {/* Desktop sidebar */}
                <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-border/60 bg-background lg:flex">
                    <SidebarNav />
                </aside>

                {/* Topbar */}
                <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 lg:pl-[276px]">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="lg:hidden"
                            >
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[260px] p-0">
                            <SheetTitle className="sr-only">
                                Admin Navigation
                            </SheetTitle>
                            <SidebarNav />
                        </SheetContent>
                    </Sheet>

                    <div className="flex-1" />

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative h-8 w-8"
                        >
                            <Bell className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-5" />
                        <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 border">
                                <AvatarFallback className="text-[10px] font-medium">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden sm:block text-xs font-medium text-muted-foreground">
                                {userName}
                            </span>
                        </div>
                    </div>
                </header>

                {/* Main */}
                <main className="lg:pl-[260px]">
                    <div className="p-6">{children}</div>
                </main>
            </div>
        </TooltipProvider>
    );
}
