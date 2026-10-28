// Socket.IO realtime layer: new messages, read receipts, typing and measured presence.
// HTTP endpoints remain the source of truth; clients fall back to polling when disconnected.
import { Server } from 'socket.io';
import { config } from '../config.js';
import { getPool } from '../db.js';
import { ensureOwnerUser, resolveSession } from './auth.service.js';

let io = null;
const onlineCounts = new Map(); // userId -> number of open sockets

export const isUserOnline = (userId) => (onlineCounts.get(Number(userId)) || 0) > 0;

export function emitToUsers(userIds, event, payload) {
  if (!io) return;
  for (const id of new Set(userIds.map(Number))) io.to(`user:${id}`).emit(event, payload);
}

async function memberIds(conversationId) {
  const [rows] = await getPool().query(
    'SELECT user_id FROM chat_conversation_members WHERE conversation_id = ? AND left_at IS NULL',
    [conversationId],
  );
  return rows.map((r) => r.user_id);
}

export async function emitToConversation(conversationId, event, payload, { exceptUserId } = {}) {
  if (!io) return;
  try {
    const ids = (await memberIds(conversationId)).filter((id) => id !== exceptUserId);
    emitToUsers(ids, event, payload);
  } catch (err) {
    console.error('[realtime] emit failed:', err.code || err.name);
  }
}

// Disconnects every socket of a user (e.g. after blocking or sign-out).
export function disconnectUser(userId) {
  if (io) io.in(`user:${Number(userId)}`).disconnectSockets(true);
}

async function presenceChanged(userId, online) {
  try {
    const ownerId = await ensureOwnerUser();
    if (userId === ownerId) {
      io.emit('presence:owner', { online });
    } else {
      emitToUsers([ownerId], 'presence:user', { userId, online });
    }
  } catch {
    /* presence is best-effort */
  }
}

export function attachRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const auth = await resolveSession(socket.handshake.auth?.token);
      if (!auth) return next(new Error('unauthorized'));
      socket.data.auth = auth;
      return next();
    } catch {
      return next(new Error('unavailable'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, name } = socket.data.auth;
    socket.join(`user:${userId}`);
    const before = onlineCounts.get(userId) || 0;
    onlineCounts.set(userId, before + 1);
    if (before === 0) presenceChanged(userId, true);

    let lastTyping = 0;
    socket.on('typing', async (payload) => {
      const conversationId = Number(payload?.conversationId);
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) return;
      const now = Date.now();
      if (now - lastTyping < 1500) return; // server-side throttle
      lastTyping = now;
      try {
        const ids = await memberIds(conversationId);
        if (!ids.includes(userId)) return; // not a member: ignore silently
        emitToUsers(
          ids.filter((id) => id !== userId),
          'typing',
          { conversationId, userId, name },
        );
      } catch {
        /* ignore */
      }
    });

    socket.on('disconnect', () => {
      const n = (onlineCounts.get(userId) || 1) - 1;
      if (n <= 0) {
        onlineCounts.delete(userId);
        presenceChanged(userId, false);
      } else {
        onlineCounts.set(userId, n);
      }
    });
  });

  return io;
}

export async function closeRealtime() {
  if (io) {
    await new Promise((resolve) => io.close(() => resolve()));
    io = null;
  }
  onlineCounts.clear();
}
