import { requireTraderSession } from '@/lib/auth-guard';
import { AIChatFullPage } from '@/components/dashboard/ai-chat-full-page';
import type { TraderRole } from '@/lib/sidebar-config';

export const metadata = {
  title: 'AI Assistant · TaxFlow',
  description: 'Ask questions about your sales, stock, tax status, and compliance.',
};

export default async function AssistantPage() {
  const session = await requireTraderSession();
  const role = (session.user.role ?? 'retailer') as TraderRole;
  const businessName =
    ((session.user as Record<string, unknown>).businessName as string | null) ??
    session.user.name ??
    'Your Business';

  return (
    <AIChatFullPage role={role} businessName={businessName} />
  );
}
