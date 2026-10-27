import { requireTraderSession } from '@/lib/auth-guard';
import { SocketProvider } from '@/components/providers/socket-provider';
import { DashboardLayoutClient } from '@/components/dashboard/dashboard-layout-client';
import type { TraderRole } from '@/lib/sidebar-config';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTraderSession();
  const role = (session.user.role ?? 'manufacturer') as TraderRole;
  const userName = session.user.name ?? 'User';
  const userId = session.user.id;
  const businessName = ((session.user as Record<string, unknown>).businessName as string) ?? 'Business';

  return (
    <div className="min-h-screen bg-background">
      <SocketProvider userId={userId}>
        <DashboardLayoutClient
          role={role}
          userName={userName}
          businessName={businessName}
          userId={userId}
        >
          {children}
        </DashboardLayoutClient>
      </SocketProvider>
    </div>
  );
}
