"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import {
    getSidebarGroups,
    ROLE_LABELS,
    ROLE_COLORS,
    type TraderRole,
} from "@/lib/sidebar-config";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Menu, Bell, LogOut, Brain } from "lucide-react";
import { useSocketContext } from "@/components/providers/socket-provider";
import { useSocket } from "@/lib/socket-client";
import { translate, translateWithContext } from '@/lib/language';
import {
    useDashboardLayoutCtx,
    LangSelector,
} from "@/components/dashboard/dashboard-layout-client";

interface DashboardTopbarProps {
    role: TraderRole;
    businessName: string;
    userId: string;
}

// ---------------------------------------------------------------------------
// Notification Bell — fetches unread count, updates on socket events
// ---------------------------------------------------------------------------
function NotificationBell({ userId }: { userId: string }) {
    const [count, setCount] = useState(0);
    const { lang } = useDashboardLayoutCtx();

    const fetchCount = useCallback(() => {
        fetch("/api/notification-count")
            .then((r) => (r.ok ? r.json() : { count: 0 }))
            .then((d) => setCount(d.count ?? 0))
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetchCount();
        const interval = window.setInterval(fetchCount, 30_000);
        window.addEventListener('focus', fetchCount);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', fetchCount);
        };
    }, [fetchCount]);

    useSocket(userId, {
        notification: fetchCount,
    });

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Link
                    href="/dashboard/notifications"
                    className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                    <Bell className="h-4 w-4" />
                    {count > 0 && (
                        <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-background">
                            {count > 99 ? '99+' : count}
                        </span>
                    )}
                    <span className="sr-only">{count > 0 ? `${count} unread notifications` : 'No unread notifications'}</span>
                </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                {count > 0
                    ? translateWithContext(`${count} unread notification${count !== 1 ? "s" : ""}`, lang)
                    : translate("Notifications", lang)}
            </TooltipContent>
        </Tooltip>
    );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------
export function DashboardTopbar({
    role,
    businessName,
    userId,
}: DashboardTopbarProps) {
    const pathname = usePathname();
    const groups = getSidebarGroups(role);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

    const { isAiOpen, openAI, lang, setLang } = useDashboardLayoutCtx();

    const handleSignOut = useCallback(async () => {
        if (isSigningOut) return;
        setIsSigningOut(true);
        try {
            await authClient.signOut({
                fetchOptions: {
                    onSuccess: () => {
                        window.location.href = "/sign-in";
                    },
                },
            });
        } catch {
            setIsSigningOut(false);
        }
    }, [isSigningOut]);

    const { connected } = useSocketContext();

    function isActive(href: string): boolean {
        if (href === "/dashboard") return pathname === "/dashboard";
        if (href.includes("?")) return false;
        return pathname === href || pathname.startsWith(href);
    }

    return (
        <TooltipProvider delayDuration={200}>
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:gap-4 sm:px-4">
                {/* Mobile menu */}
                <Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
                    <SheetTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden -ml-2"
                        >
                            <Menu className="h-5 w-5" />
                            <span className="sr-only">Toggle menu</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[min(86vw,18rem)] max-w-[18rem] p-0">
                        <SheetTitle className="sr-only">Navigation</SheetTitle>

                        {/* Mobile logo */}
                        <div className="flex h-14 items-center gap-2.5 px-5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
                                TF
                            </div>
                            <span className="text-[15px] font-semibold tracking-tight">
                                TaxFlow
                            </span>
                        </div>

                        <Separator className="opacity-60" />

                        {/* Business info */}
                        <div className="px-5 py-3">
                            <p className="text-[13px] font-medium truncate">
                                {businessName}
                            </p>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "mt-1 text-[10px] px-1.5 py-0",
                                    ROLE_COLORS[role],
                                )}
                            >
                                {translate(ROLE_LABELS[role], lang)}
                            </Badge>
                        </div>

                        <Separator className="opacity-60" />

                        {/* Grouped nav */}
                        <nav className="flex-1 overflow-y-auto py-2">
                            {groups.map((group, gi) => (
                                <div key={gi}>
                                    {group.label && (
                                        <div className="px-5 pt-4 pb-1.5">
                                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                                {translate(group.label, lang)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="px-2 space-y-[2px]">
                                        {group.items.map((item) => {
                                            const active = isActive(item.href);
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={() => setIsMobileNavigationOpen(false)}
                                                    className={cn(
                                                        "relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-colors",
                                                        active
                                                            ? "bg-accent text-foreground"
                                                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                                    )}
                                                >
                                                    {active && (
                                                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-foreground" />
                                                    )}
                                                    <item.icon className="h-4 w-4 shrink-0" />
                                                    {translate(item.label, lang)}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                    {gi < groups.length - 1 && (
                                        <Separator className="my-2 opacity-60" />
                                    )}
                                </div>
                            ))}
                        </nav>

                        <Separator className="opacity-60" />

                        {/* Sign out */}
                        <div className="px-2 py-3">
                            <button
                                onClick={handleSignOut}
                                disabled={isSigningOut}
                                className="flex w-full items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                            >
                                <LogOut className="h-4 w-4" />
                                {isSigningOut ? "Signing out…" : "Sign Out"}
                            </button>
                        </div>
                    </SheetContent>
                </Sheet>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Right side */}
                <div className="flex items-center gap-2">
                    {/* Connection status dot */}
                    <span
                        className={cn(
                            "hidden h-2 w-2 rounded-full sm:block",
                            connected ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                        title={connected ? "Connected" : "Disconnected"}
                    />

                    {/* Notification Bell */}
                    <NotificationBell userId={userId} />

                    <Separator orientation="vertical" className="h-5 mx-1 opacity-60" />

                    {/* Language Selector */}
                    <LangSelector value={lang} onChange={setLang} />

                    {/* Ask AI button — hidden while panel is open */}
                    {!isAiOpen && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={openAI}
                            className="h-9 gap-1 px-2 text-xs font-medium sm:h-8 sm:gap-1.5 sm:px-3"
                        >
                            <Brain className="h-3.5 w-3.5" />
                            <span className="sm:hidden">AI</span><span className="hidden sm:inline">Ask AI</span>
                        </Button>
                    )}

                </div>
            </header>
        </TooltipProvider>
    );
}
