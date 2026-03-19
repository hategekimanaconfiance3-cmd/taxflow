import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { CHANNEL } from './realtime';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

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
  const pubClient = new Redis(REDIS_URL);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

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

  // ─── Bridge: subscribe to Valkey channel for server action events ───
  const realtimeSub = new Redis(REDIS_URL);
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
