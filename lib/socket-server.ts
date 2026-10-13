import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { CHANNEL } from './realtime';
import { auth } from './auth';

const REDIS_URL = process.env.REDIS_URL || 'redis://:Taxflow07857@localhost:6380';

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server with Valkey pub/sub adapter.
 * Also subscribes to the realtime channel to forward events from
 * server actions (which run in separate Next.js worker processes).
 */
export function initSocketServer(httpServer: import('http').Server) {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    path: '/api/socketio',
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Valkey pub/sub adapter for multi-server scaling
  const redisOpts = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  };

  const pubClient = new Redis(REDIS_URL, redisOpts);
  pubClient.on('error', (err) => {
    console.error('[Socket.IO] Pub client error:', err.message);
  });

  const subClient = pubClient.duplicate();
  subClient.on('error', (err) => {
    console.error('[Socket.IO] Sub client error:', err.message);
  });

  io.adapter(createAdapter(pubClient, subClient));

  // Authenticate the socket from Better Auth's HTTP-only session cookie.
  // Never trust a user ID supplied in the Socket.IO handshake payload.
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie;
      if (!cookie) {
        next(new Error('Unauthorized'));
        return;
      }

      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });

      if (!session?.user) {
        next(new Error('Unauthorized'));
        return;
      }

      (socket.data as { authenticatedUserId?: string }).authenticatedUserId = session.user.id;
      next();
    } catch (error) {
      console.error('[Socket.IO] Session verification failed:', error);
      next(new Error('Unauthorized'));
    }
  });

  // Join only the room belonging to the server-verified session.
  io.on('connection', (socket) => {
    const userId = (socket.data as { authenticatedUserId?: string }).authenticatedUserId;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`[Socket.IO] Authenticated user connected (${socket.id})`);
    }

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Socket ${socket.id} disconnected`);
    });
  });

  // ─── Bridge: subscribe to Valkey channel for server action events ───
  const realtimeSub = new Redis(REDIS_URL, redisOpts);
  realtimeSub.on('error', (err) => {
    console.error('[Socket.IO] Realtime sub error:', err.message);
  });
  realtimeSub.subscribe(CHANNEL, (err) => {
    if (err) {
      console.error('[Socket.IO] Failed to subscribe to realtime channel:', err);
      return;
    }
    console.log('[Socket.IO] Subscribed to realtime channel');
  });

  realtimeSub.on('message', (_channel: string, message: string) => {
    try {
      const { userId, event, data } = JSON.parse(message);
      if (userId && event && io) {
        io.to(`user:${userId}`).emit(event, data);
        console.log(`[Socket.IO] Forwarded ${event} to user:${userId}`);
      }
    } catch (err) {
      console.error('[Socket.IO] Failed to parse realtime message:', err);
    }
  });

  console.log('[Socket.IO] Server initialized with Valkey adapter');
  return io;
}

/**
 * Get the Socket.IO server instance.
 * Returns null if not initialized (e.g., in serverless context).
 */
export function getIO(): SocketIOServer | null {
  return io;
}
