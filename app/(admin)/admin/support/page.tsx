import { redirect } from 'next/navigation';
import { requireRRAPermission } from '@/lib/auth-guard';

export default async function AdminSupportPage() {
  await requireRRAPermission('communications.staff.use');
  redirect('/admin/messages');
}
