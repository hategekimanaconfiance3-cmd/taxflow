"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    markNotificationRead,
    markAllNotificationsRead,
} from "@/lib/actions/notification.action";
import { useSocket } from "@/lib/socket-client";
import { useSocketContext } from "@/components/providers/socket-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Bell,
    BellOff,
    Check,
    CheckCheck,
    ArrowDownLeft,
    ArrowUpRight,
    ShieldAlert,
    Info,
    ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    link: string | null;
    read: boolean;
    createdAt: Date;
}

const ICON_MAP: Record<string, typeof Bell> = {
    txn_incoming: ArrowDownLeft,
    txn_confirmed: Check,
    txn_rejected: ArrowUpRight,
    compliance_alert: ShieldAlert,
    system: Info,
};

const COLOR_MAP: Record<string, string> = {
    txn_incoming: "text-amber-500",
    txn_confirmed: "text-emerald-500",
    txn_rejected: "text-red-500",
    compliance_alert: "text-orange-500",
    system: "text-blue-500",
};

function timeAgo(date: Date): string {
    const seconds = Math.floor(
        (Date.now() - new Date(date).getTime()) / 1000,
    );
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationsClientProps {
    notifications: Notification[];
    unreadCount: number;
}

export function NotificationsClient({
    notifications: initialNotifications,
    unreadCount: initialUnread,
}: NotificationsClientProps) {
    const router = useRouter();
    const { userId } = useSocketContext();
    const [isPending, startTransition] = useTransition();
    const [filter, setFilter] = useState<"all" | "unread">("all");

    // Auto-refresh on new notifications
    const handleRefresh = useCallback(() => {
        router.refresh();
    }, [router]);

    useSocket(userId, {
        notification: handleRefresh,
    });

    const filtered =
        filter === "unread"
            ? initialNotifications.filter((n) => !n.read)
            : initialNotifications;

    function handleMarkRead(id: string) {
        startTransition(async () => {
            await markNotificationRead(id);
            router.refresh();
        });
    }

    function handleMarkAllRead() {
        startTransition(async () => {
            await markAllNotificationsRead();
            router.refresh();
        });
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Notifications
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {initialUnread > 0
                            ? `${initialUnread} unread notification${initialUnread !== 1 ? "s" : ""}`
                            : "All caught up!"}
                    </p>
                </div>
                {initialUnread > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMarkAllRead}
                        disabled={isPending}
                        className="gap-1.5"
                    >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                    </Button>
                )}
            </div>

            {/* Filter tabs */}
            <div className="flex items-center rounded-md border border-border/60 bg-background w-fit overflow-hidden">
                <button
                    onClick={() => setFilter("all")}
                    className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors ${filter === "all"
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                        }`}
                >
                    <Bell className="h-3.5 w-3.5" />
                    All
                </button>
                <button
                    onClick={() => setFilter("unread")}
                    className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors border-l border-border/60 ${filter === "unread"
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                        }`}
                >
                    <BellOff className="h-3.5 w-3.5" />
                    Unread
                    {initialUnread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                            {initialUnread}
                        </span>
                    )}
                </button>
            </div>

            {/* Notification list */}
            {filtered.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium">
                            {filter === "unread"
                                ? "No unread notifications"
                                : "No notifications yet"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            You&apos;ll see transaction updates and alerts here.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0 divide-y divide-border/60">
                        {filtered.map((notif) => {
                            const Icon =
                                ICON_MAP[notif.type] || Bell;
                            const color =
                                COLOR_MAP[notif.type] || "text-muted-foreground";

                            return (
                                <div
                                    key={notif.id}
                                    className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${!notif.read
                                            ? "bg-accent/30"
                                            : "hover:bg-accent/10"
                                        }`}
                                >
                                    {/* Icon */}
                                    <div
                                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ${color}`}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium truncate">
                                                {notif.title}
                                            </p>
                                            {!notif.read && (
                                                <Badge
                                                    variant="secondary"
                                                    className="h-4 px-1 text-[9px] font-bold bg-blue-500/10 text-blue-600"
                                                >
                                                    NEW
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">
                                            {notif.message}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground/60 mt-1">
                                            {timeAgo(notif.createdAt)}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {notif.link && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                asChild
                                            >
                                                <Link href={notif.link}>
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </Link>
                                            </Button>
                                        )}
                                        {!notif.read && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-emerald-600"
                                                onClick={() =>
                                                    handleMarkRead(notif.id)
                                                }
                                                disabled={isPending}
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
