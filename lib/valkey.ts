import Redis from 'ioredis';

// Valkey/Redis client singleton for server-side use
// Valkey is 100% Redis-compatible, so ioredis works perfectly

const REDIS_URL = process.env.REDIS_URL;

function createValkeyClient() {
  if (!REDIS_URL) {
    console.warn('[Valkey] REDIS_URL is not set. Caching and real-time features will be disabled.');
    return null;
  }

  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) return null; // stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  client.on('error', (err: Error) => {
    console.error('[Valkey] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('[Valkey] Connected');
  });

  return client;
}

// Singleton — reuse across hot reloads in dev
const globalForValkey = globalThis as unknown as {
  valkey: Redis | null | undefined;
};

export const valkey = globalForValkey.valkey ?? createValkeyClient();

if (process.env.NODE_ENV !== 'production') {
  globalForValkey.valkey = valkey;
}
