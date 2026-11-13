import { MessagingInbox } from '@/components/messaging/messaging-inbox';
import { listRRAConversations, getMessagingRoutingSettings } from '@/lib/actions/messaging.action';
import { requireRRAPermission } from '@/lib/auth-guard';
import { hasRRAPermission } from '@/lib/rra-rbac';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const session = await requireRRAPermission('communications.staff.use');
  const params = await searchParams;
  const conversations = await listRRAConversations({});
  const canManageCases = session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'support.manage'));
  const canContactTaxpayers = canManageCases && session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'taxpayer.intelligence.search'));
  const routingRules = session.staff.clearanceRoles.some((role) => hasRRAPermission(role, 'system.configure'))
    ? await getMessagingRoutingSettings()
    : undefined;

  return (
    <MessagingInbox
      audience="rra"
      initialConversations={conversations}
      currentUserId={session.user.id}
      initialConversationId={params.conversation}
      canContactTaxpayers={canContactTaxpayers}
      canManageCases={canManageCases}
      routingRules={routingRules}
    />
  );
}
