import { redirect } from 'next/navigation';
import { requireRRASession } from '@/lib/auth-guard';
import { getAdminNavigationLinks } from '@/lib/admin-sidebar-config';

export default async function AdminDashboardPage() {
  const { staff } = await requireRRASession();
  const firstAuthorizedPage = getAdminNavigationLinks(staff.clearanceRoles)[0]?.href;
  redirect(firstAuthorizedPage ?? '/admin/profile');
}
