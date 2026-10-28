import { MessagingInbox } from '@/components/messaging/messaging-inbox';
import { listMyConversations } from '@/lib/actions/messaging.action';
import { requireTraderSession } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const session = await requireTraderSession();
  const params = await searchParams;
  const conversations = await listMyConversations({});

  return (
    <MessagingInbox
      audience="trader"
      initialConversations={conversations}
      currentUserId={session.user.id}
      initialConversationId={params.conversation}
    />
  );
}
