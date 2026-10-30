import { redirect } from 'next/navigation';
import { requireRRAPermission } from '@/lib/auth-guard';

/**
 * Roles that can mutate tickets (assign / reply / resolve / reopen).
 * Must match the allowlist inside admin-support-ticket.action.ts.
 */
const MANAGE_ROLES = ["compliance_officer", "tax_compliance_officer"] as const;

export default async function AdminSupportPage() {
  await requireRRAPermission('communications.staff.use');
  redirect('/admin/messages');
}
