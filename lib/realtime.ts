import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://:Taxflow07857@localhost:6380';
const CHANNEL = 'taxflow:realtime';

/**
 * Emit a real-time event to a specific user.
 *
 * This publishes to a Valkey channel because server actions run in
 * separate Next.js worker processes that don't have access to the
 * Socket.IO instance. The Socket.IO server (in server.ts) subscribes
 * to this channel and forwards events to connected clients.
 */
export function emitToUser(userId: string, event: string, data: Record<string, unknown>) {
  try {
    const pub = getPublisher();
    const message = JSON.stringify({
      userId,
      event,
      data: { ...data, timestamp: Date.now() },
    });
    pub.publish(CHANNEL, message);
  } catch (err) {
    // Gracefully fail — don't break server actions if Valkey is down
    console.warn('[Realtime] Failed to publish event:', err);
  }
}

/**
 * Emit to multiple users at once.
 */
export function emitToUsers(userIds: string[], event: string, data: Record<string, unknown>) {
  for (const userId of userIds) {
    emitToUser(userId, event, data);
  }
}

// ---------------------------------------------------------------------------
// Singleton publisher — lazy-initialized, reused across server action calls
// ---------------------------------------------------------------------------

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: true,
    });
    publisher.connect().catch(() => {
      // Will be retried on next call
      publisher = null;
    });
  }
  return publisher;
}

export { CHANNEL };
