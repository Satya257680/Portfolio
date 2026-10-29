import { config, isProduction } from '../config.js';
import { getPool, isChatReady } from '../db.js';
import { createSession, ensureOwnerUser, revokeSession } from '../services/auth.service.js';
import { getOrCreateDirect } from '../services/chat.service.js';
import { isEmailConfigured, sendEmail } from '../services/email/mailer.js';
import { verificationEmail } from '../services/email/templates.js';
import { isUserOnline } from '../services/realtime.js';
import { hashCode, randomCode, safeEqualHex, hashPassword, verifyPassword, dummyPasswordCheck } from '../utils/security.js';
import { validateVerificationRequest, validateVerifyCode } from '../validators/chat.validator.js';

// GET /api/chat/status — safe public information only.
export async function chatStatus(req, res) {
  const ready = config.chat.enabled && (await isChatReady());
  let ownerOnline = false;
  if (ready) {
    try {
      ownerOnline = isUserOnline(await ensureOwnerUser());
    } catch {
      /* ignore */
    }
  }
  res.json({
    ok: true,
    enabled: ready,
    emailVerification: isEmailConfigured() || !isProduction(),
    ownerName: config.owner.name,
    ownerOnline,
    realtime: true,
  });
}

// POST /api/chat/auth/request-verification — emails a single-use 6-digit code.
export async function requestVerification(req, res, next) {
  try {
    if (!config.chat.enabled) return res.status(503).json({ ok: false, message: 'Chat is currently disabled.' });
    if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
      return res.status(400).json({ ok: false, message: 'Request rejected.' });
    }
    const { data, errors, valid } = validateVerificationRequest(req.body);
    if (!valid) return res.status(422).json({ ok: false, message: 'Please correct the highlighted fields.', errors });

    if (data.email === config.owner.email) {
      return res.status(403).json({ ok: false, message: 'This address belongs to the site owner. Please use the admin sign-in.' });
    }

    const pool = getPool();
    const [[existingAccount]] = await pool.query('SELECT password_hash, is_owner, status FROM chat_users WHERE email = ? LIMIT 1', [data.email]);
    if (existingAccount?.is_owner) return res.status(403).json({ ok: false, message: 'This address belongs to the site owner. Please use the admin sign-in.' });
    // Blocked accounts are refused before the "already exists" check, so a block always reads as a block.
    if (existingAccount?.status === 'blocked') {
      return res.status(403).json({ ok: false, message: 'This email cannot start a chat. Please use the contact form instead.' });
    }
    if (existingAccount?.password_hash) return res.status(409).json({ ok: false, message: 'An account already exists for this email. Please sign in or use Forgot password.' });

    const [[recent]] = await pool.query(
      `SELECT COUNT(*) AS n FROM chat_verification_codes
       WHERE email = ? AND purpose = 'chat_login' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE`,
      [data.email],
    );
    if (Number(recent.n) >= config.chat.codesPerEmailPerWindow) {
      return res.status(429).json({ ok: false, message: 'Too many codes requested for this email. Please wait 15 minutes.' });
    }

    // Only the newest code is valid: invalidate earlier unused codes for this email.
    await pool.query(
      "UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = 'chat_login' AND used_at IS NULL",
      [data.email],
    );

    const code = randomCode();
    const expiresAt = new Date(Date.now() + config.chat.codeTtlMinutes * 60 * 1000);
    const [ins] = await pool.query(
      `INSERT INTO chat_verification_codes (email, display_name, code_hash, purpose, expires_at)
       VALUES (?, ?, ?, 'chat_login', ?)`,
      [data.email, data.name, hashCode(data.email, code), expiresAt],
    );

    const tpl = verificationEmail({ name: data.name, email: data.email, code, ttlMinutes: config.chat.codeTtlMinutes });
    const result = await sendEmail({
      kind: 'chat_verification',
      to: data.email,
      relatedType: 'verification',
      relatedId: ins.insertId,
      idempotencyKey: `verify-${ins.insertId}`,
      devPreview: `verification code for ${data.email}: ${code}`,
      ...tpl,
    });

    if (result.status === 'sent') {
      return res.json({ ok: true, emailSent: true, message: `We sent a 6-digit code to ${data.email}.` });
    }
    if (result.status === 'skipped' && !isProduction()) {
      // Development only: no provider configured, so hand the code back to make local testing possible.
      return res.json({ ok: true, emailSent: false, devCode: code, message: 'Development mode: email is not configured.' });
    }
    await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [ins.insertId]);
    return res.status(502).json({
      ok: false,
      message: 'We could not send the verification email right now. Please try again later or use the contact form.',
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/chat/auth/verify — checks the code and opens a secure, revocable session.
export async function verifyCode(req, res, next) {
  try {
    const { data, errors, valid } = validateVerifyCode(req.body);
    if (!valid) return res.status(422).json({ ok: false, message: 'Please correct the highlighted fields.', errors });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, display_name, code_hash, attempts FROM chat_verification_codes
       WHERE email = ? AND purpose = 'chat_login' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
       ORDER BY id DESC LIMIT 1`,
      [data.email],
    );
    const row = rows[0];
    const invalid = { ok: false, message: 'That code is invalid or has expired. Request a new code.' };
    if (!row) return res.status(400).json(invalid);
    if (row.attempts >= config.chat.codeMaxAttempts) {
      await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
      return res.status(429).json({ ok: false, message: 'Too many wrong attempts. Request a new code.' });
    }
    if (!safeEqualHex(row.code_hash, hashCode(data.email, data.code))) {
      await pool.query('UPDATE chat_verification_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      const left = config.chat.codeMaxAttempts - row.attempts - 1;
      return res.status(400).json({
        ok: false,
        message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.',
      });
    }

    // First-time visitors must create a password after verifying their email.
    // Keep the code unused until set-password consumes it.
    const [[existingUser]] = await pool.query('SELECT password_hash, status, is_owner FROM chat_users WHERE email = ? LIMIT 1', [data.email]);
    if (!existingUser || !existingUser.password_hash) {
      return res.json({ ok: true, requiresPasswordSetup: true, email: data.email, name: row.display_name });
    }

    // Single use: mark consumed before creating the session.
    const [used] = await pool.query(
      'UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL',
      [row.id],
    );
    if (used.affectedRows !== 1) return res.status(400).json(invalid);

    await pool.query(
      `INSERT INTO chat_users (display_name, email, email_verified_at)
       VALUES (?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         display_name = IF(is_owner = 1, display_name, VALUES(display_name)),
         email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()),
         updated_at = UTC_TIMESTAMP()`,
      [row.display_name, data.email],
    );
    const [[user]] = await pool.query('SELECT id, display_name, email, status, is_owner FROM chat_users WHERE email = ?', [
      data.email,
    ]);
    if (user.status === 'blocked' || user.is_owner) {
      return res.status(403).json({ ok: false, message: 'This email cannot start a chat.' });
    }

    const ownerId = await ensureOwnerUser();
    const conversationId = await getOrCreateDirect(user.id, ownerId);
    const session = await createSession({ userId: user.id, kind: 'visitor' });

    return res.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, name: user.display_name, email: user.email },
      conversationId,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/chat/auth/login — returning visitors sign in with their password.
export async function loginVisitor(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !password || password.length > 200) {
      return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, display_name, email, password_hash, status, is_owner FROM chat_users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || user.is_owner || user.status === 'blocked' || !user.password_hash) {
      await dummyPasswordCheck(password);
      return res.status(user?.status === 'blocked' ? 403 : 401).json({ ok: false, message: user?.status === 'blocked' ? 'This account is blocked from chat.' : 'Incorrect email or password.' });
    }
    if (!(await verifyPassword(password, user.password_hash))) return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
    const ownerId = await ensureOwnerUser();
    const conversationId = await getOrCreateDirect(user.id, ownerId);
    const session = await createSession({ userId: user.id, kind: 'visitor' });
    res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, user: { id: user.id, name: user.display_name, email: user.email }, conversationId });
  } catch (err) { next(err); }
}

// POST /api/chat/auth/set-password — consumes the email-verification code for a new account.
export async function setVisitorPassword(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code) || password.length < 10 || password.length > 200) {
      return res.status(422).json({ ok: false, message: 'Use a valid email, 6-digit code, and password with at least 10 characters.' });
    }
    const pool = getPool();
    const [codes] = await pool.query(`SELECT id, display_name, code_hash, attempts FROM chat_verification_codes WHERE email = ? AND purpose = 'chat_login' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1`, [email]);
    const row = codes[0];
    if (!row || row.attempts >= config.chat.codeMaxAttempts || !safeEqualHex(row.code_hash, hashCode(email, code))) {
      if (row) await pool.query('UPDATE chat_verification_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return res.status(400).json({ ok: false, message: 'That code is invalid or has expired. Request a new code.' });
    }
    const [[prior]] = await pool.query('SELECT id, status, is_owner FROM chat_users WHERE email = ? LIMIT 1', [email]);
    if (prior?.status === 'blocked' || prior?.is_owner) return res.status(403).json({ ok: false, message: 'This email cannot start a chat.' });
    const passwordHash = await hashPassword(password);
    await pool.query(`INSERT INTO chat_users (display_name, email, email_verified_at, password_hash) VALUES (?, ?, UTC_TIMESTAMP(), ?) ON DUPLICATE KEY UPDATE display_name = IF(is_owner = 1, display_name, VALUES(display_name)), email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()), password_hash = COALESCE(password_hash, VALUES(password_hash)), updated_at = UTC_TIMESTAMP()`, [row.display_name, email, passwordHash]);
    const [used] = await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL', [row.id]);
    if (used.affectedRows !== 1) return res.status(400).json({ ok: false, message: 'That code has already been used. Please sign in.' });
    const [[user]] = await pool.query('SELECT id, display_name, email, status, is_owner FROM chat_users WHERE email = ?', [email]);
    if (user.status === 'blocked' || user.is_owner) return res.status(403).json({ ok: false, message: 'This email cannot start a chat.' });
    const ownerId = await ensureOwnerUser();
    const conversationId = await getOrCreateDirect(user.id, ownerId);
    const session = await createSession({ userId: user.id, kind: 'visitor' });
    res.json({ ok: true, token: session.token, expiresAt: session.expiresAt, user: { id: user.id, name: user.display_name, email: user.email }, conversationId });
  } catch (err) { next(err); }
}

// Number of visitor reset codes issued for this email in the current 15-minute window.
export async function recentResetCodes(email) {
  const [[recent]] = await getPool().query(`SELECT COUNT(*) AS n FROM chat_verification_codes WHERE email = ? AND purpose = 'password_reset' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE`, [email]);
  return Number(recent.n);
}

// Creates a single-use visitor reset code (only its hash is stored) and emails it to the account owner.
// Shared by "Forgot password" and the admin "Require password reset" action. Returns
// { status, code, codeId } — the plaintext code must only ever go to the user's own email
// (or, in development without a provider, back to that user's own browser), never to an admin.
export async function issueVisitorResetCode({ email, name }) {
  const pool = getPool();
  await pool.query(`UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = 'password_reset' AND used_at IS NULL`, [email]);
  const code = randomCode();
  const expiresAt = new Date(Date.now() + config.chat.codeTtlMinutes * 60 * 1000);
  const [ins] = await pool.query(`INSERT INTO chat_verification_codes (email, display_name, code_hash, purpose, expires_at) VALUES (?, ?, ?, 'password_reset', ?)`, [email, name, hashCode(email, code), expiresAt]);
  const tpl = verificationEmail({ name, email, code, ttlMinutes: config.chat.codeTtlMinutes });
  const result = await sendEmail({ kind: 'chat_password_reset', to: email, relatedType: 'password_reset', relatedId: ins.insertId, idempotencyKey: `password-reset-${ins.insertId}`, ...tpl });
  return { status: result.status, code, codeId: ins.insertId };
}

// POST /api/chat/auth/request-reset — always returns a generic message to prevent email enumeration.
// Verified accounts without a password (never set, or cleared by an admin-required reset) can use
// this flow to choose one; the emailed code proves ownership of the address.
export async function requestPasswordReset(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(422).json({ ok: false, message: 'Enter a valid email address.' });
    const pool = getPool();
    const [[user]] = await pool.query('SELECT display_name, email_verified_at, status, is_owner FROM chat_users WHERE email = ? LIMIT 1', [email]);
    const generic = 'If this email has a chat account, a reset code has been sent.';
    if (!user || !user.email_verified_at || user.status === 'blocked' || user.is_owner) return res.json({ ok: true, message: generic, emailSent: false });
    if ((await recentResetCodes(email)) >= config.chat.codesPerEmailPerWindow) return res.status(429).json({ ok: false, message: 'Too many reset requests. Please wait 15 minutes.' });
    const { status, code, codeId } = await issueVisitorResetCode({ email, name: user.display_name });
    if (status === 'sent') return res.json({ ok: true, emailSent: true, message: generic });
    if (status === 'skipped' && !isProduction()) return res.json({ ok: true, emailSent: false, devCode: code, message: generic });
    await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [codeId]);
    return res.status(502).json({ ok: false, message: 'Could not send the reset email. Please try again later.' });
  } catch (err) { next(err); }
}

// POST /api/chat/auth/reset-password — verifies a one-time reset code and stores only a hash.
export async function resetVisitorPassword(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code) || password.length < 10 || password.length > 200) return res.status(422).json({ ok: false, message: 'Use a valid email, 6-digit code, and password with at least 10 characters.' });
    const pool = getPool();
    const [rows] = await pool.query(`SELECT id, code_hash, attempts FROM chat_verification_codes WHERE email = ? AND purpose = 'password_reset' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1`, [email]);
    const row = rows[0];
    if (!row || row.attempts >= config.chat.codeMaxAttempts || !safeEqualHex(row.code_hash, hashCode(email, code))) {
      if (row) await pool.query('UPDATE chat_verification_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return res.status(400).json({ ok: false, message: 'That reset code is invalid or has expired.' });
    }
    const passwordHash = await hashPassword(password);
    const [updated] = await pool.query(`UPDATE chat_users SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE email = ? AND is_owner = 0 AND status = 'active'`, [passwordHash, email]);
    if (!updated.affectedRows) return res.status(400).json({ ok: false, message: 'Unable to reset this account.' });
    await pool.query('UPDATE chat_verification_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
    const [[user]] = await pool.query('SELECT id FROM chat_users WHERE email = ?', [email]);
    await pool.query('UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
    res.json({ ok: true, message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (err) { next(err); }
}

// GET /api/chat/me
export async function me(req, res, next) {
  try {
    const ownerId = await ensureOwnerUser();
    res.json({
      ok: true,
      user: { id: req.auth.userId, name: req.auth.name, email: req.auth.email, isOwner: req.auth.isOwner },
      isAdmin: req.auth.isAdmin,
      owner: { id: ownerId, name: config.owner.name, online: isUserOnline(ownerId) },
      expiresAt: req.auth.expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/chat/auth/logout (also used by the admin)
export async function logout(req, res, next) {
  try {
    await revokeSession(req.auth.sessionId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
