import { requireTraderSession } from '@/lib/auth-guard';
import { getNotifications } from '@/lib/actions/notification.action';
import { NotificationsClient } from '@/components/dashboard/notifications/notifications-client';

export default async function NotificationsPage() {
  await requireTraderSession();

  const notifications = await getNotifications();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Transaction alerts, compliance notices, and system messages.
        </p>
      </div>

      <NotificationsClient
        notifications={notifications}
        unreadCount={notifications.filter((notification) => !notification.read).length}
      />
    </div>
  );
}
