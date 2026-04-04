import { requireRRASession } from '@/lib/auth-guard';
import { AdminShell } from '@/components/admin/admin-shell/admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, staff } = await requireRRASession();

  return (
    <AdminShell userName={user.name} staffId={staff.staffId} clearanceLevel={staff.clearanceLevel}>
      {children}
    </AdminShell>
  );
}
