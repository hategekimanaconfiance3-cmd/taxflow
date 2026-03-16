import { requireRRASession } from "@/lib/auth-guard";
import { getAdminNotifications } from "@/lib/actions/admin-notification.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle, ArrowLeftRight, CheckCircle, Shield, Info } from "lucide-react";
import { AdminBulkNotifyDialog } from "@/components/admin/admin-bulk-notify-dialog";

const TYPE_CONFIG: Record<
    string,
    { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
    txn_incoming: { icon: ArrowLeftRight, color: "text-blue-600", label: "Transaction" },
    txn_confirmed: { icon: CheckCircle, color: "text-emerald-600", label: "Confirmed" },
    txn_rejected: { icon: AlertTriangle, color: "text-red-600", label: "Rejected" },
    compliance_alert: { icon: Shield, color: "text-amber-600", label: "Compliance" },
    system: { icon: Info, color: "text-violet-600", label: "System" },
};

export default async function AdminNotificationsPage() {
    const { staff } = await requireRRASession();
    const notifications = await getAdminNotifications();

    const canBulkSend =
        staff.clearanceLevel === "senior_officer" ||
        staff.clearanceLevel === "admin" ||
        staff.clearanceLevel === "super_admin";

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Notifications
                    </h1>
                    <p className="text-muted-foreground">
                        System notifications and bulk messaging.
                    </p>
                </div>
                {canBulkSend && <AdminBulkNotifyDialog />}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        All Notifications ({notifications.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No notifications yet.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {notifications.map((n) => {
                                const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
                                const Icon = config.icon;
                                return (
                                    <div
                                        key={n.id}
                                        className="flex items-start gap-3 rounded-lg border p-3"
                                    >
                                        <Icon
                                            className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">
                                                    {n.title}
                                                </p>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px]"
                                                >
                                                    {config.label}
                                                </Badge>
                                                {!n.read && (
                                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {n.message}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                To: {n.businessName ?? n.userName} ·{" "}
                                                {new Date(n.createdAt).toLocaleString(
                                                    "en-RW",
                                                    {
                                                        dateStyle: "short",
                                                        timeStyle: "short",
                                                    },
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
