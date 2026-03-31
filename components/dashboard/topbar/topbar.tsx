"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useCallback } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Menu, Bell, LogOut } from "lucide-react";
import { useSocketContext } from "@/components/providers/socket-provider";

interface DashboardTopbarProps {
    role: TraderRole;
    userName: string;
    businessName: string;
    userId: string;
}

export function DashboardTopbar({
    role,
    userName,
    businessName,
    userId,
}: DashboardTopbarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const groups = getSidebarGroups(role);
    const [isSigningOut, setIsSigningOut] = useState(false);

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
        } catch (error) {
            console.error("Sign-out failed:", error);
            setIsSigningOut(false);
        }
    }, [isSigningOut]);
    const initials = userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    const { connected } = useSocketContext();
    function isActive(href: string): boolean {
        if (href === "/dashboard") return pathname === "/dashboard";
        if (href.includes("?")) return false;
        return pathname === href || pathname.startsWith(href);
    }

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 lg:pl-[276px]">
            {/* Mobile menu */}
            <Sheet>
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
                <SheetContent side="left" className="w-[260px] p-0">
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
                            {ROLE_LABELS[role]}
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
                                            {group.label}
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
                                                {item.label}
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
            <div className="flex items-center gap-3">
                {/* Connection status */}
                <span
                    className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    title={connected ? "Connected" : "Disconnected"}
                />

                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                    <Bell className="h-4 w-4" />
                </Button>

                <Separator orientation="vertical" className="h-5 opacity-60" />

                <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7 border border-border/60">
                        <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block">
                        <p className="text-[13px] font-medium leading-none">
                            {userName}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {ROLE_LABELS[role]}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
}
