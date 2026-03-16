import {
    getNotifications,
    getUnreadCount,
    markAllNotificationsRead,
} from "@/lib/actions/notification.action";
import { NotificationsClient } from "@/components/dashboard/notifications/notifications-client";

export default async function NotificationsPage() {
    const [notifications, unreadCount] = await Promise.all([
        getNotifications(),
        getUnreadCount(),
    ]);

    return (
        <NotificationsClient
            notifications={notifications}
            unreadCount={unreadCount}
        />
    );
}
