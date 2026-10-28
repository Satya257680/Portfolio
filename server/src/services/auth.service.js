// Session + owner identity helpers shared by HTTP routes and the realtime socket.
import { config } from '../config.js';
import { getPool } from '../db.js';
import { hashPassword, randomToken, sha256 } from '../utils/security.js';

let ownerIdCache = null;

// Ensures the portfolio owner exists as a chat user and returns its id.
export async function ensureOwnerUser() {
  if (ownerIdCache) return ownerIdCache;
  const pool = getPool();
  const [rows] = await pool.query('SELECT id FROM chat_users WHERE is_owner = 1 ORDER BY id LIMIT 1');
  if (rows.length) {
    ownerIdCache = rows[0].id;
    return ownerIdCache;
  }
  await pool.query(
    `INSERT INTO chat_users (display_name, email, email_verified_at, is_owner, status)
     VALUES (?, ?, UTC_TIMESTAMP(), 1, 'active')
     ON DUPLICATE KEY UPDATE is_owner = 1, status = 'active', display_name = VALUES(display_name)`,
    [config.owner.name, config.owner.email],
  );
  const [again] = await pool.query('SELECT id FROM chat_users WHERE is_owner = 1 ORDER BY id LIMIT 1');
  ownerIdCache = again[0].id;
  return ownerIdCache;
}

export function resetOwnerCache() {
  ownerIdCache = null;
}

// Creates an opaque session token; only its SHA-256 hash is persisted.
export async function createSession({ userId, kind = 'visitor', adminUserId = null }) {
  const token = randomToken(32);
  const ttlMs =
    kind === 'admin' ? config.chat.adminSessionHours * 3600 * 1000 : config.chat.visitorSessionDays * 86400 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await getPool().query(
    `INSERT INTO chat_sessions (user_id, token_hash, kind, admin_user_id, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [userId, sha256(token), kind, adminUserId, expiresAt],
  );
  return { token, expiresAt };
}

// Resolves a bearer token to an authenticated identity, or null.
export async function resolveSession(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const [rows] = await getPool().query(
    `SELECT s.id AS session_id, s.kind, s.admin_user_id, s.expires_at,
            u.id AS user_id, u.display_name, u.email, u.is_owner, u.status
     FROM chat_sessions s
     JOIN chat_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [sha256(token)],
  );
  const r = rows[0];
  if (!r || r.status === 'blocked') return null;
  // An admin session is only valid for the owner account.
  if (r.kind === 'admin' && !r.is_owner) return null;
  getPool()
    .query(
      `UPDATE chat_sessions SET last_used_at = UTC_TIMESTAMP()
       WHERE id = ? AND (last_used_at IS NULL OR last_used_at < UTC_TIMESTAMP() - INTERVAL 5 MINUTE)`,
      [r.session_id],
    )
    .catch(() => {});
  return {
    sessionId: r.session_id,
    userId: r.user_id,
    name: r.display_name,
    email: r.email,
    isOwner: Boolean(r.is_owner),
    isAdmin: r.kind === 'admin' && Boolean(r.is_owner),
    kind: r.kind,
    expiresAt: r.expires_at,
  };
}

export async function revokeSession(sessionId) {
  await getPool().query('UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL', [
    sessionId,
  ]);
}

export async function revokeUserSessions(userId) {
  await getPool().query('UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [
    userId,
  ]);
}

export async function audit(actorUserId, action, targetType = null, targetId = null, details = null) {
  try {
    await getPool().query(
      'INSERT INTO chat_audit_logs (actor_user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      [actorUserId, action, targetType, targetId, details ? String(details).slice(0, 500) : null],
    );
  } catch (err) {
    console.error('[audit] write failed:', err.code || err.name);
  }
}

// Optional one-time admin bootstrap from ADMIN_EMAIL / ADMIN_PASSWORD (only if no admin exists).
export async function bootstrapAdminFromEnv() {
  const { bootstrapEmail, bootstrapPassword } = config.admin;
  if (!bootstrapEmail || !bootstrapPassword) return false;
  const pool = getPool();
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM admin_users');
  if (Number(rows[0].n) > 0) return false;
  if (bootstrapPassword.length < 12) {
    console.error('[admin] ADMIN_PASSWORD must be at least 12 characters — admin not created.');
    return false;
  }
  await pool.query('INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)', [
    bootstrapEmail,
    await hashPassword(bootstrapPassword),
    'owner',
  ]);
  console.log(`[admin] initial admin created for ${bootstrapEmail}. Remove ADMIN_PASSWORD from the environment now.`);
  return true;
}
