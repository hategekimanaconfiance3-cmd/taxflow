import { redirect } from 'next/navigation';
import { requireTraderSession } from '@/lib/auth-guard';

export default async function SupportPage() {
  await requireTraderSession();
  redirect('/dashboard/messages');
}
