import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { CHANNEL } from './realtime';

const REDIS_URL = process.env.REDIS_URL || 'redis://:Taxflow07857@localhost:6380';

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server.
 * Connects to Valkey/Redis adapter if available; gracefully falls back
 * to standalone in-memory mode if Redis/Valkey is not running.
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

  // Auth: join user-specific room on connection
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`[Socket.IO] User ${userId} connected (${socket.id})`);
    }

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Socket ${socket.id} disconnected`);
    });
  });

  // Valkey/Redis pub/sub adapter with graceful standalone fallback
  const redisOpts = {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  };

  const pubClient = new Redis(REDIS_URL, redisOpts);
  const subClient = pubClient.duplicate();
  const realtimeSub = pubClient.duplicate();

  pubClient.on('error', () => {});
  subClient.on('error', () => {});
  realtimeSub.on('error', () => {});

  pubClient
    .connect()
    .then(() => subClient.connect())
    .then(() => {
      if (io) {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[Socket.IO] Connected with Valkey/Redis adapter');
      }
      return realtimeSub.connect();
    })
    .then(() => {
      realtimeSub.subscribe(CHANNEL, (err) => {
        if (!err) console.log('[Socket.IO] Subscribed to realtime channel');
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
    })
    .catch(() => {
      console.log('[Socket.IO] Valkey/Redis offline — running in standalone in-memory mode');
    });

  return io;
}

/**
 * Get the Socket.IO server instance.
 * Returns null if not initialized (e.g., in serverless context).
 */
export function getIO(): SocketIOServer | null {
  return io;
}
