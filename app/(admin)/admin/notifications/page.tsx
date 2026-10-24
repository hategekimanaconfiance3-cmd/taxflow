import Link from 'next/link';
import { Bell, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminNotifications } from '@/lib/actions/admin-notification.action';
import { requireRRASession } from '@/lib/auth-guard';

export default async function AdminNotificationsPage() {
  await requireRRASession();
  const notifications = await getAdminNotifications();
  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alerts and updates sent to your RRA staff account.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Bell className="h-4 w-4" />
            Your notifications
            <Badge variant="secondary" className="ml-auto">
              {unreadCount} unread
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifications.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center">
              <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">You’re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Notifications sent to your account will appear here.
              </p>
            </div>
          ) : notifications.map((item) => {
            const internalHref = item.link?.startsWith('/') && !item.link.startsWith('//')
              ? item.link
              : null;
            const content = (
              <div className={`rounded-md border p-4 ${item.read ? 'bg-background' : 'bg-muted/40'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!item.read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                      <p className="text-sm font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.createdAt.toISOString()}>
                    {item.createdAt.toLocaleString()}
                  </time>
                </div>
                {internalHref && (
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Open related page <ExternalLink className="h-3 w-3" />
                  </span>
                )}
              </div>
            );

            return internalHref ? (
              <Link key={item.id} href={internalHref} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {content}
              </Link>
            ) : <div key={item.id}>{content}</div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
