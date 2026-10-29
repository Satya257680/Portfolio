import { getPool } from '../db.js';
import { audit, createSession, ensureOwnerUser, isOwnerAdminEmail, revokeSession, revokeUserSessions } from '../services/auth.service.js';
import { ChatError } from '../services/chat.service.js';
import { disconnectUser, emitToConversation, isUserOnline, onlineUserIds } from '../services/realtime.js';
import { issueVisitorResetCode, recentResetCodes } from './chatAuth.controller.js';
import { dummyPasswordCheck, verifyPassword, hashPassword, randomCode, randomToken, hashCode, safeEqualHex } from '../utils/security.js';
import { config, isProduction } from '../config.js';
import { logEvent, redactEmail, sendEmail } from '../services/email/mailer.js';
import { adminPasswordResetEmail } from '../services/email/templates.js';
import { clean, parseId, validateEmail } from '../validators/chat.validator.js';
import { handle } from './chat.controller.js';

const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

// POST /api/admin/auth/login  { email, password }
export const login = handle(async (req, res) => {
  const email = validateEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fail = () => res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
  if (!email || !password || password.length > 200) return fail();
  // Only the portfolio owner's email can ever sign in here; any other address gets the same
  // generic answer with similar timing (no hint that it is not the owner address).
  if (!isOwnerAdminEmail(email)) {
    await dummyPasswordCheck(password);
    await audit(null, 'admin.login.denied', 'admin_user', null, 'non-owner email');
    return fail();
  }

  const pool = getPool();
  const [rows] = await pool.query('SELECT id, email, password_hash, is_active FROM admin_users WHERE email = ? LIMIT 1', [
    email,
  ]);
  const admin = rows[0];
  if (!admin || !admin.is_active) {
    await dummyPasswordCheck(password); // similar timing for unknown accounts
    return fail();
  }
  if (!(await verifyPassword(password, admin.password_hash))) {
    await audit(null, 'admin.login.failed', 'admin_user', admin.id);
    return fail();
  }
  const ownerId = await ensureOwnerUser();
  const session = await createSession({ userId: ownerId, kind: 'admin', adminUserId: admin.id });
  await pool.query('UPDATE admin_users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [admin.id]);
  await audit(ownerId, 'admin.login', 'admin_user', admin.id);
  const [[owner]] = await pool.query('SELECT id, display_name, email FROM chat_users WHERE id = ?', [ownerId]);
  res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: owner.id, name: owner.display_name, email: owner.email, isOwner: true },
  });
});

// Public wording for every reset request. It never claims the email was delivered: "sent" from the
// provider only means accepted, and unknown emails get the same text (no account enumeration).
export const ADMIN_RESET_GENERIC =
  'If this email belongs to an active admin account, a reset code is on its way. It can take a few minutes — check Inbox, Spam and All Mail. Only the newest code works.';

// POST /api/admin/auth/request-reset — reset code is sent only to a registered admin email.
// Every step is logged as a redacted "admin_reset.*" JSON line (never the code or a password).
export const requestAdminPasswordReset = handle(async (req, res) => {
  const ref = randomToken(6); // correlates the log lines of one request
  const email = validateEmail(req.body?.email);
  logEvent('admin_reset.requested', { ref, to: email ? redactEmail(email) : '[invalid-address]' });
  if (!email) throw new ChatError(422, 'Enter a valid email address.');
  if (!isOwnerAdminEmail(email)) {
    logEvent('admin_reset.ineligible', { ref, to: redactEmail(email), reason: 'not_owner_email' }, 'warn');
    return res.json({ ok: true, message: ADMIN_RESET_GENERIC });
  }
  const pool = getPool();
  const [admins] = await pool.query('SELECT id, email, is_active FROM admin_users WHERE email = ? LIMIT 1', [email]);
  if (!admins[0] || !admins[0].is_active) {
    // Same public response as success, but the reason is kept in the server log.
    logEvent('admin_reset.ineligible', {
      ref,
      to: redactEmail(email),
      reason: admins[0] ? 'admin_inactive' : 'not_registered',
      hint: 'a reset code is only emailed to an active admin_users row; see the "[admin] active admin accounts" startup line',
    }, 'warn');
    return res.json({ ok: true, message: ADMIN_RESET_GENERIC });
  }
  const adminId = admins[0].id;
  const [[recent]] = await pool.query(`SELECT COUNT(*) AS n FROM chat_verification_codes WHERE email = ? AND purpose = 'admin_password_reset' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE`, [email]);
  if (Number(recent.n) >= config.chat.codesPerEmailPerWindow) {
    logEvent('admin_reset.rate_limited', { ref, adminId, recentCodes: Number(recent.n), limit: config.chat.codesPerEmailPerWindow }, 'warn');
    throw new ChatError(429, 'Too many reset requests. Please wait 15 minutes and use the newest code you received.');
  }

  const code = randomCode();
  const expiresAt = new Date(Date.now() + config.chat.codeTtlMinutes * 60 * 1000);
  const [ins] = await pool.query(`INSERT INTO chat_verification_codes (email, display_name, code_hash, purpose, expires_at) VALUES (?, 'Portfolio Chat Admin', ?, 'admin_password_reset', ?)`, [email, hashCode(email, code), expiresAt]);
  logEvent('admin_reset.code_created', { ref, adminId, codeId: ins.insertId, expiresAt: expiresAt.toISOString() });

  const tpl = adminPasswordResetEmail({ code, ttlMinutes: config.chat.codeTtlMinutes });
  logEvent('admin_reset.send_attempt', { ref, adminId, codeId: ins.insertId, provider: config.email.provider, to: redactEmail(email) });
  const result = await sendEmail({ kind: 'admin_password_reset', to: email, relatedType: 'admin_password_reset', relatedId: ins.insertId, idempotencyKey: `admin-reset-${ins.insertId}`, ...tpl });
  logEvent('admin_reset.send_result', {
    ref,
    adminId,
    codeId: ins.insertId,
    status: result.status,
    providerMessageId: result.providerMessageId || null,
    category: result.category || null,
    httpStatus: result.httpStatus || null,
    attempts: result.attempts ?? null,
  }, result.status === 'sent' ? 'info' : 'error');

  const devFallback = result.status === 'skipped' && !isProduction();
  if (result.status === 'sent' || devFallback) {
    // Only now retire older unused codes, so a failed send never cancels a code that was already emailed.
    await pool.query(`UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = 'admin_password_reset' AND used_at IS NULL AND id < ?`, [email, ins.insertId]);
    return res.json({ ok: true, message: ADMIN_RESET_GENERIC, ...(devFallback ? { devCode: code } : {}) });
  }
  // Delivery failed: the new code can never arrive, so retire it and report the failure honestly.
  await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [ins.insertId]);
  throw new ChatError(502, `Could not send the reset email right now. Please try again in a few minutes. (Reference: ${ref})`);
});

// POST /api/admin/auth/reset-password — admin code reset, no existing session required.
export const resetAdminPassword = handle(async (req, res) => {
  const email = validateEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !/^\d{6}$/.test(code) || password.length < 12 || password.length > 200) throw new ChatError(422, 'Use a valid email, 6-digit code, and password with at least 12 characters.');
  if (!isOwnerAdminEmail(email)) throw new ChatError(400, 'That reset code is invalid or has expired.');
  const pool = getPool();
  const [rows] = await pool.query(`SELECT id, code_hash, attempts FROM chat_verification_codes WHERE email = ? AND purpose = 'admin_password_reset' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1`, [email]);
  const row = rows[0];
  if (!row || row.attempts >= config.chat.codeMaxAttempts || !safeEqualHex(row.code_hash, hashCode(email, code))) {
    if (row) await pool.query('UPDATE chat_verification_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const reason = !row ? 'no_active_code' : row.attempts >= config.chat.codeMaxAttempts ? 'too_many_attempts' : 'code_mismatch';
    logEvent('admin_reset.verify_failed', { to: redactEmail(email), reason, codeId: row?.id || null }, 'warn');
    throw new ChatError(400, 'That reset code is invalid or has expired.');
  }
  const [updated] = await pool.query('UPDATE admin_users SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE email = ? AND is_active = 1', [await hashPassword(password), email]);
  if (!updated.affectedRows) {
    logEvent('admin_reset.verify_failed', { to: redactEmail(email), reason: 'admin_not_active', codeId: row.id }, 'warn');
    throw new ChatError(400, 'Unable to reset this admin account.');
  }
  await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
  const [admins] = await pool.query('SELECT id FROM admin_users WHERE email = ?', [email]);
  // Sign out every existing session of this admin (all devices) after a password change.
  if (admins[0]) await pool.query('UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP() WHERE admin_user_id = ? AND revoked_at IS NULL', [admins[0].id]);
  await audit(null, 'admin.password_reset', 'admin_user', admins[0]?.id || null);
  logEvent('admin_reset.completed', { to: redactEmail(email), adminId: admins[0]?.id || null, codeId: row.id });
  res.json({ ok: true, message: 'Admin password reset successfully. Please sign in with your new password.' });
});

// POST /api/admin/auth/logout
export const logout = handle(async (req, res) => {
  await revokeSession(req.auth.sessionId);
  await audit(req.auth.userId, 'admin.logout');
  res.json({ ok: true });
});

// PATCH /api/admin/conversations/:id/status  { status: open | closed | archived }
export const setConversationStatus = handle(async (req, res) => {
  const id = parseId(req.params.id);
  const status = String(req.body?.status || '');
  if (!id) throw new ChatError(404, 'Conversation not found.');
  if (!['open', 'closed', 'archived'].includes(status)) throw new ChatError(422, 'Invalid status.');
  const [r] = await getPool().query('UPDATE chat_conversations SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
    status,
    id,
  ]);
  if (!r.affectedRows) throw new ChatError(404, 'Conversation not found.');
  await audit(req.auth.userId, `conversation.${status}`, 'conversation', id);
  await emitToConversation(id, 'conversation:updated', { conversationId: id });
  res.json({ ok: true, status });
});

// POST /api/admin/users/:id/block  { blocked: boolean }
export const setUserBlocked = handle(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new ChatError(404, 'User not found.');
  const blocked = Boolean(req.body?.blocked);
  const ownerId = await ensureOwnerUser();
  if (id === ownerId) throw new ChatError(400, 'You cannot block yourself.');
  const [r] = await getPool().query('UPDATE chat_users SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
    blocked ? 'blocked' : 'active',
    id,
  ]);
  if (!r.affectedRows) throw new ChatError(404, 'User not found.');
  if (blocked) {
    await revokeUserSessions(id);
    disconnectUser(id);
  }
  await audit(req.auth.userId, blocked ? 'user.block' : 'user.unblock', 'chat_user', id);
  res.json({ ok: true, blocked });
});

// ---------- account directory (metadata only — never passwords or password hashes) ----------

const intParam = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const num = (v) => Number(v || 0);

// Every column here is safe to send to the admin's browser. `has_password` is a boolean derived on
// the server; the hash itself is never selected.
const USER_SELECT = `
  SELECT u.id, u.display_name, u.email, u.status, u.is_owner, u.email_verified_at, u.created_at,
         (u.password_hash IS NOT NULL) AS has_password,
         (SELECT MAX(s.last_used_at) FROM chat_sessions s WHERE s.user_id = u.id) AS last_seen_at,
         (SELECT MAX(m.created_at) FROM chat_messages m
           WHERE m.sender_id = u.id AND m.message_type <> 'system') AS last_message_at,
         (SELECT COUNT(*) FROM chat_messages m
           WHERE m.sender_id = u.id AND m.deleted_at IS NULL AND m.message_type <> 'system') AS message_count,
         (SELECT COUNT(*) FROM chat_sessions s
           WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()) AS active_sessions,
         c.id AS direct_id,
         (SELECT COUNT(*) FROM chat_messages x
           WHERE x.conversation_id = c.id AND x.id > om.last_read_message_id
             AND x.sender_id <> om.user_id AND x.deleted_at IS NULL) AS unread
  FROM chat_users u
  LEFT JOIN chat_conversations c
         ON c.type = 'direct' AND c.direct_key = CONCAT(LEAST(u.id, ?), ':', GREATEST(u.id, ?))
  LEFT JOIN chat_conversation_members om ON om.conversation_id = c.id AND om.user_id = ?`;

// Applied to the derived table `t` (see listUsers), so computed columns can be sorted portably
// on MySQL, MariaDB and TiDB.
const USER_SORTS = {
  newest: 't.created_at DESC, t.id DESC',
  oldest: 't.created_at ASC, t.id ASC',
  name: 't.display_name ASC, t.id ASC',
  active: 'GREATEST(COALESCE(t.last_seen_at, t.created_at), COALESCE(t.last_message_at, t.created_at)) DESC, t.id DESC',
};

function toAdminUser(u) {
  const times = [u.last_seen_at, u.last_message_at].filter(Boolean).map((t) => new Date(t).getTime());
  const isOwner = Boolean(u.is_owner);
  return {
    id: u.id,
    name: u.display_name,
    email: u.email,
    status: u.status,
    role: isOwner ? 'admin' : 'user',
    isOwner,
    verifiedAt: u.email_verified_at,
    createdAt: u.created_at,
    lastActiveAt: times.length ? new Date(Math.max(...times)) : null,
    // Account state only: whether a password exists — never the password or its hash.
    passwordStatus: isOwner ? 'admin_managed' : Number(u.has_password) ? 'set' : 'reset_required',
    messageCount: num(u.message_count),
    activeSessions: num(u.active_sessions),
    conversationId: u.direct_id || null,
    unread: num(u.unread),
    online: isUserOnline(u.id),
  };
}

function userFilters(query) {
  const q = clean(String(query.q || '')).slice(0, 80);
  const where = ['u.email_verified_at IS NOT NULL'];
  const params = [];
  if (query.includeOwner !== '1') where.push('u.is_owner = 0');
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push('(u.display_name LIKE ? OR u.email LIKE ?)');
    params.push(like, like);
  }
  if (['active', 'blocked'].includes(query.status)) {
    where.push('u.status = ?');
    params.push(query.status);
  }
  // Explicit selection (e.g. "export selected"): up to 100 numeric ids.
  if (typeof query.ids === 'string' && query.ids) {
    const ids = [...new Set(query.ids.split(',').map(parseId).filter(Boolean))].slice(0, 100);
    where.push(ids.length ? 'u.id IN (?)' : '1 = 0');
    if (ids.length) params.push(ids);
  }
  if (query.access === 'password_set') where.push('(u.is_owner = 0 AND u.password_hash IS NOT NULL)');
  if (query.access === 'reset_required') where.push('(u.is_owner = 0 AND u.password_hash IS NULL)');
  return { whereSql: where.join(' AND '), params };
}

// GET /api/admin/users?q=&status=active|blocked&access=password_set|reset_required&sort=&page=&pageSize=&includeOwner=1
// Without paging params it behaves as before (newest 100 verified visitors) so the group picker keeps working.
export const listUsers = handle(async (req, res) => {
  const pool = getPool();
  const ownerId = await ensureOwnerUser();
  const { whereSql, params } = userFilters(req.query);
  const sort = USER_SORTS[req.query.sort] ? req.query.sort : 'newest';
  const page = intParam(req.query.page, 1, 1, 100000);
  const pageSize = intParam(req.query.pageSize, 100, 1, 100);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM chat_users u WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM (${USER_SELECT} WHERE ${whereSql}) t ORDER BY ${USER_SORTS[sort]} LIMIT ? OFFSET ?`,
    [ownerId, ownerId, ownerId, ...params, pageSize, (page - 1) * pageSize],
  );
  res.json({ ok: true, total: num(total), page, pageSize, sort, users: rows.map(toAdminUser) });
});

// GET /api/admin/users/:id — account metadata + the conversations this user belongs to.
export const getUser = handle(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new ChatError(404, 'User not found.');
  const pool = getPool();
  const ownerId = await ensureOwnerUser();
  const [rows] = await pool.query(`${USER_SELECT} WHERE u.id = ? LIMIT 1`, [ownerId, ownerId, ownerId, id]);
  if (!rows[0]) throw new ChatError(404, 'User not found.');
  const [convs] = await pool.query(
    `SELECT c.id, c.type, c.title, c.status, c.last_message_at, c.created_at,
            (SELECT COUNT(*) FROM chat_messages x
              WHERE x.conversation_id = c.id AND x.sender_id = m.user_id AND x.deleted_at IS NULL
                AND x.message_type <> 'system') AS sent
     FROM chat_conversation_members m
     JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.user_id = ? AND m.left_at IS NULL
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 50`,
    [id],
  );
  res.json({
    ok: true,
    user: toAdminUser(rows[0]),
    conversations: convs.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.type === 'group' ? c.title : 'Direct chat with you',
      status: c.status,
      lastActivityAt: c.last_message_at || c.created_at,
      sent: num(c.sent),
    })),
  });
});

// Loads a non-owner account for a sensitive action; destructive actions need { confirm: true }.
async function targetUser(req) {
  const id = parseId(req.params.id);
  if (!id) throw new ChatError(404, 'User not found.');
  if (req.body?.confirm !== true) throw new ChatError(428, 'Please confirm this action.');
  const ownerId = await ensureOwnerUser();
  if (id === ownerId) throw new ChatError(400, 'Manage your own admin account from Settings.');
  const [[user]] = await getPool().query(
    'SELECT id, display_name, email, status FROM chat_users WHERE id = ? AND is_owner = 0 LIMIT 1',
    [id],
  );
  if (!user) throw new ChatError(404, 'User not found.');
  return user;
}

// POST /api/admin/users/:id/sign-out  { confirm: true } — ends every session of the user on all devices.
export const signOutUser = handle(async (req, res) => {
  const user = await targetUser(req);
  const [r] = await getPool().query(
    'UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
    [user.id],
  );
  disconnectUser(user.id);
  await audit(req.auth.userId, 'user.sessions.revoke', 'chat_user', user.id, `sessions=${r.affectedRows}`);
  res.json({ ok: true, revoked: r.affectedRows, message: `${user.display_name} was signed out on all devices.` });
});

// POST /api/admin/users/:id/require-password-reset  { confirm: true }
// Clears the stored hash (the old password stops working), signs the user out everywhere and emails
// them a single-use reset code. The admin never sees the old password, the new one, or the code.
export const requirePasswordReset = handle(async (req, res) => {
  const user = await targetUser(req);
  if (user.status === 'blocked') throw new ChatError(409, 'Unblock this account before requiring a password reset.');
  const pool = getPool();
  await pool.query('UPDATE chat_users SET password_hash = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ? AND is_owner = 0', [
    user.id,
  ]);
  await revokeUserSessions(user.id);
  disconnectUser(user.id);

  let emailed = false;
  if ((await recentResetCodes(user.email)) < config.chat.codesPerEmailPerWindow) {
    const { status, codeId } = await issueVisitorResetCode({ email: user.email, name: user.display_name });
    emailed = status === 'sent';
    // An undelivered code can never be used by its owner, so retire it. The user can request a new one.
    if (!emailed) await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [codeId]);
  }
  await audit(req.auth.userId, 'user.password.require_reset', 'chat_user', user.id, `email=${emailed ? 'sent' : 'not_sent'}`);
  res.json({
    ok: true,
    emailed,
    message: emailed
      ? `${user.display_name} was signed out and emailed a reset code. Their old password no longer works.`
      : `${user.display_name} was signed out and their old password no longer works. The reset email could not be sent right now — they can use “Forgot password” on the chat sign-in page.`,
  });
});

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/admin/users/export?q=&status=&access= — CSV of account metadata (no passwords). Audited.
export const exportUsers = handle(async (req, res) => {
  const ownerId = await ensureOwnerUser();
  const { whereSql, params } = userFilters(req.query);
  const [rows] = await getPool().query(`${USER_SELECT} WHERE ${whereSql} ORDER BY u.created_at DESC, u.id DESC LIMIT 5000`, [
    ownerId,
    ownerId,
    ownerId,
    ...params,
  ]);
  const users = rows.map(toAdminUser);
  const header = ['id', 'name', 'email', 'role', 'status', 'password', 'verified_at', 'registered_at', 'last_active_at', 'messages'];
  const lines = users.map((u) =>
    [u.id, u.name, u.email, u.role, u.status, u.passwordStatus === 'set' ? 'set (hashed)' : u.passwordStatus, u.verifiedAt, u.createdAt, u.lastActiveAt, u.messageCount]
      .map(csvCell)
      .join(','),
  );
  await audit(req.auth.userId, 'users.export', 'chat_user', null, `rows=${users.length}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="portfolio-users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${[header.join(','), ...lines].join('\r\n')}\r\n`);
});

// ---------- dashboard & analytics (real database values only) ----------

// GET /api/admin/dashboard?days=7|30|90
export const dashboard = handle(async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const pool = getPool();
  const ownerId = await ensureOwnerUser();
  const [[users]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(created_at > UTC_TIMESTAMP() - INTERVAL ? DAY) AS recent,
            SUM(status = 'blocked') AS blocked,
            SUM(password_hash IS NULL) AS reset_pending
     FROM chat_users WHERE is_owner = 0 AND email_verified_at IS NOT NULL`,
    [days],
  );
  const [[convs]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(type = 'direct') AS direct, SUM(type = 'group') AS grp
     FROM chat_conversations WHERE last_message_id IS NOT NULL`,
  );
  const [[msgs]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(created_at > UTC_TIMESTAMP() - INTERVAL ? DAY) AS recent
     FROM chat_messages WHERE deleted_at IS NULL AND message_type <> 'system'`,
    [days],
  );
  // "Active" = signed-in API use or a sent message in the last 24 h (session use is recorded server-side).
  const [[active]] = await pool.query(
    `SELECT COUNT(DISTINCT t.user_id) AS n FROM (
       SELECT s.user_id FROM chat_sessions s WHERE s.last_used_at > UTC_TIMESTAMP() - INTERVAL 1 DAY
       UNION
       SELECT m.sender_id FROM chat_messages m WHERE m.created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY
     ) t JOIN chat_users u ON u.id = t.user_id WHERE u.is_owner = 0`,
  );
  const [[unread]] = await pool.query(
    `SELECT COUNT(*) AS messages, COUNT(DISTINCT x.conversation_id) AS conversations
     FROM chat_conversation_members m
     JOIN chat_messages x ON x.conversation_id = m.conversation_id
     WHERE m.user_id = ? AND m.left_at IS NULL AND x.id > m.last_read_message_id
       AND x.sender_id <> m.user_id AND x.deleted_at IS NULL`,
    [ownerId],
  );
  const [[contact]] = await pool.query('SELECT COUNT(*) AS total, SUM(is_read = 0) AS unread FROM contact_messages');
  const [[reports]] = await pool.query("SELECT COUNT(*) AS n FROM chat_reports WHERE status = 'open'");
  const [recent] = await pool.query(
    `SELECT id, display_name, email, status, created_at FROM chat_users
     WHERE is_owner = 0 AND email_verified_at IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 5`,
  );
  res.json({
    ok: true,
    periodDays: days,
    users: {
      total: num(users.total),
      new: num(users.recent),
      blocked: num(users.blocked),
      resetPending: num(users.reset_pending),
      active24h: num(active.n),
      onlineNow: onlineUserIds().filter((id) => id !== ownerId).length,
    },
    chats: {
      conversations: num(convs.total),
      direct: num(convs.direct),
      groups: num(convs.grp),
      messages: num(msgs.total),
      newMessages: num(msgs.recent),
      unreadMessages: num(unread.messages),
      unreadConversations: num(unread.conversations),
    },
    contact: { total: num(contact.total), unread: num(contact.unread) },
    reports: { open: num(reports.n) },
    recentUsers: recent.map((u) => ({ id: u.id, name: u.display_name, email: u.email, status: u.status, createdAt: u.created_at })),
    generatedAt: new Date(),
  });
});

// GET /api/admin/analytics?days=7..90&tzOffset=<minutes east of UTC> — daily counts in the viewer's time zone.
export const analytics = handle(async (req, res) => {
  const days = intParam(req.query.days, 30, 7, 90);
  const tz = intParam(req.query.tzOffset, 0, -720, 840);
  const pool = getPool();
  const local = (col) => `DATE_FORMAT(${col} + INTERVAL ? MINUTE, '%Y-%m-%d')`;
  const window = `UTC_TIMESTAMP() - INTERVAL ? DAY`;
  const series = async (sql, extra = []) => {
    const [rows] = await pool.query(sql, [tz, ...extra, days + 1]);
    return new Map(rows.map((r) => [r.d, num(r.n)]));
  };
  const signups = await series(
    `SELECT ${local('created_at')} AS d, COUNT(*) AS n FROM chat_users
     WHERE is_owner = 0 AND email_verified_at IS NOT NULL AND created_at > ${window} GROUP BY d`,
  );
  const messagesBy = (owner) =>
    series(
      `SELECT ${local('m.created_at')} AS d, COUNT(*) AS n FROM chat_messages m JOIN chat_users u ON u.id = m.sender_id
       WHERE u.is_owner = ? AND m.deleted_at IS NULL AND m.message_type <> 'system' AND m.created_at > ${window} GROUP BY d`,
      [owner ? 1 : 0],
    );
  const visitorMessages = await messagesBy(false);
  const ownerMessages = await messagesBy(true);
  const contactMessages = await series(
    `SELECT ${local('created_at')} AS d, COUNT(*) AS n FROM contact_messages WHERE created_at > ${window} GROUP BY d`,
  );

  const nowLocal = Date.now() + tz * 60000;
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(nowLocal - i * 86400000).toISOString().slice(0, 10);
    out.push({
      date,
      signups: signups.get(date) || 0,
      visitorMessages: visitorMessages.get(date) || 0,
      ownerMessages: ownerMessages.get(date) || 0,
      contactMessages: contactMessages.get(date) || 0,
    });
  }
  const totals = out.reduce(
    (t, d) => ({
      signups: t.signups + d.signups,
      visitorMessages: t.visitorMessages + d.visitorMessages,
      ownerMessages: t.ownerMessages + d.ownerMessages,
      contactMessages: t.contactMessages + d.contactMessages,
    }),
    { signups: 0, visitorMessages: 0, ownerMessages: 0, contactMessages: 0 },
  );
  res.json({ ok: true, days, tzOffset: tz, series: out, totals });
});

// ---------- admin account & audit ----------

// GET /api/admin/account — the signed-in admin's own account (never the password or hash).
export const account = handle(async (req, res) => {
  const pool = getPool();
  const [[a]] = await pool.query('SELECT id, email, role, last_login_at, created_at, updated_at FROM admin_users WHERE id = ?', [
    req.auth.adminUserId,
  ]);
  if (!a) throw new ChatError(404, 'Admin account not found.');
  const [[s]] = await pool.query(
    `SELECT COUNT(*) AS n FROM chat_sessions
     WHERE admin_user_id = ? AND kind = 'admin' AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [a.id],
  );
  res.json({
    ok: true,
    account: {
      email: a.email,
      role: a.role,
      lastLoginAt: a.last_login_at,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      activeSessions: num(s.n),
      sessionHours: config.chat.adminSessionHours,
    },
  });
});

// POST /api/admin/auth/logout-others — signs out every other admin session (other devices).
export const logoutOtherSessions = handle(async (req, res) => {
  const [r] = await getPool().query(
    `UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP()
     WHERE admin_user_id = ? AND kind = 'admin' AND id <> ? AND revoked_at IS NULL`,
    [req.auth.adminUserId, req.auth.sessionId],
  );
  await audit(req.auth.userId, 'admin.sessions.revoke_others', 'admin_user', req.auth.adminUserId, `sessions=${r.affectedRows}`);
  res.json({ ok: true, revoked: r.affectedRows });
});

// GET /api/admin/audit-logs?page=&pageSize= — sensitive actions (never contains secrets).
export const listAuditLogs = handle(async (req, res) => {
  const page = intParam(req.query.page, 1, 1, 100000);
  const pageSize = intParam(req.query.pageSize, 50, 1, 100);
  const pool = getPool();
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM chat_audit_logs');
  const [rows] = await pool.query(
    `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, u.display_name AS actor_name
     FROM chat_audit_logs l LEFT JOIN chat_users u ON u.id = l.actor_user_id
     ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize],
  );
  res.json({
    ok: true,
    total: num(total),
    page,
    pageSize,
    logs: rows.map((l) => ({
      id: l.id,
      action: l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      details: l.details,
      actor: l.actor_name || null,
      createdAt: l.created_at,
    })),
  });
});

// GET /api/admin/contact-messages?q=&filter=unread&page=&pageSize=
export const listContactMessages = handle(async (req, res) => {
  const q = clean(String(req.query.q || '')).slice(0, 80);
  const page = intParam(req.query.page, 1, 1, 100000);
  const pageSize = intParam(req.query.pageSize, 200, 1, 200);
  const where = [];
  const params = [];
  if (req.query.filter === 'unread') where.push('is_read = 0');
  if (q) {
    where.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
    const like = `%${likeEscape(q)}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM contact_messages ${whereSql}`, params);
  // IP address and user agent are intentionally not returned (data minimisation).
  const [rows] = await getPool().query(
    `SELECT id, name, email, subject, message, is_read, created_at FROM contact_messages
     ${whereSql}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const [[{ unread }]] = await getPool().query('SELECT COUNT(*) AS unread FROM contact_messages WHERE is_read = 0');
  res.json({
    ok: true,
    unread: Number(unread),
    total: num(total),
    page,
    pageSize,
    messages: rows.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      subject: m.subject,
      message: m.message,
      read: Boolean(m.is_read),
      createdAt: m.created_at,
    })),
  });
});

// PATCH /api/admin/contact-messages/:id/read  { read: boolean }
export const setContactRead = handle(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new ChatError(404, 'Message not found.');
  const read = req.body?.read === undefined ? true : Boolean(req.body.read);
  const [r] = await getPool().query('UPDATE contact_messages SET is_read = ? WHERE id = ?', [read ? 1 : 0, id]);
  if (!r.affectedRows) throw new ChatError(404, 'Message not found.');
  res.json({ ok: true, read });
});

// GET /api/admin/email-deliveries — sanitised status only (no message bodies, no secrets).
export const listEmailDeliveries = handle(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT id, kind, recipient, provider, status, error_summary, attempts, related_type, related_id, created_at
     FROM email_delivery_logs ORDER BY id DESC LIMIT 100`,
  );
  res.json({
    ok: true,
    deliveries: rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      recipient: d.recipient,
      provider: d.provider,
      status: d.status,
      error: d.error_summary,
      attempts: d.attempts,
      relatedType: d.related_type,
      relatedId: d.related_id,
      createdAt: d.created_at,
    })),
  });
});

// GET /api/admin/reports
export const listReports = handle(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT r.id, r.conversation_id, r.reason, r.status, r.created_at, u.display_name AS reporter_name, u.email AS reporter_email
     FROM chat_reports r JOIN chat_users u ON u.id = r.reporter_id
     ORDER BY r.id DESC LIMIT 100`,
  );
  res.json({
    ok: true,
    reports: rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      reporter: { name: r.reporter_name, email: r.reporter_email },
    })),
  });
});
