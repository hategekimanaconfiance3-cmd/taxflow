import { redirect } from 'next/navigation';
import { requireTraderSession } from '@/lib/auth-guard';

export default async function NewSupportTicketPage() {
  await requireTraderSession();
  redirect('/dashboard/messages');
}
