import { redirect } from 'next/navigation';
import { conversationIdSchema } from '@/lib/validation/messaging.schema';

/** Preserve older notification links while keeping the messages page as the authorized inbox. */
export default async function AdminCommunicationsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; conversation?: string }>;
}) {
  const params = await searchParams;
  const candidate = params.conversationId ?? params.conversation;
  const parsedConversationId = conversationIdSchema.safeParse(candidate);

  if (!parsedConversationId.success) {
    redirect('/admin/messages');
  }

  redirect(`/admin/messages?conversation=${encodeURIComponent(parsedConversationId.data)}`);
}
