import { getPool } from '../db.js';
import { audit, createSession, ensureOwnerUser, revokeSession, revokeUserSessions } from '../services/auth.service.js';
import { ChatError } from '../services/chat.service.js';
import { disconnectUser, emitToConversation, isUserOnline } from '../services/realtime.js';
import { dummyPasswordCheck, verifyPassword } from '../utils/security.js';
import { clean, parseId, validateEmail } from '../validators/chat.validator.js';
import { handle } from './chat.controller.js';

const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

// POST /api/admin/auth/login  { email, password }
export const login = handle(async (req, res) => {
  const email = validateEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fail = () => res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
  if (!email || !password || password.length > 200) return fail();

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

// GET /api/admin/users?q= — verified visitors (used to pick group members).
export const listUsers = handle(async (req, res) => {
  const q = clean(String(req.query.q || '')).slice(0, 80);
  const params = [];
  let where = 'is_owner = 0 AND email_verified_at IS NOT NULL';
  if (q) {
    where += ' AND (display_name LIKE ? OR email LIKE ?)';
    params.push(`%${likeEscape(q)}%`, `%${likeEscape(q)}%`);
  }
  const [rows] = await getPool().query(
    `SELECT id, display_name, email, status, email_verified_at, created_at FROM chat_users
     WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
    params,
  );
  res.json({
    ok: true,
    users: rows.map((u) => ({
      id: u.id,
      name: u.display_name,
      email: u.email,
      status: u.status,
      verifiedAt: u.email_verified_at,
      online: isUserOnline(u.id),
    })),
  });
});

// GET /api/admin/contact-messages?q=&filter=unread
export const listContactMessages = handle(async (req, res) => {
  const q = clean(String(req.query.q || '')).slice(0, 80);
  const where = [];
  const params = [];
  if (req.query.filter === 'unread') where.push('is_read = 0');
  if (q) {
    where.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
    const like = `%${likeEscape(q)}%`;
    params.push(like, like, like, like);
  }
  // IP address and user agent are intentionally not returned (data minimisation).
  const [rows] = await getPool().query(
    `SELECT id, name, email, subject, message, is_read, created_at FROM contact_messages
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY id DESC LIMIT 200`,
    params,
  );
  const [[{ unread }]] = await getPool().query('SELECT COUNT(*) AS unread FROM contact_messages WHERE is_read = 0');
  res.json({
    ok: true,
    unread: Number(unread),
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
