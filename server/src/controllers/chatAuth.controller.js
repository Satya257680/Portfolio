import { config, isProduction } from '../config.js';
import { getPool, isChatReady } from '../db.js';
import { createSession, ensureOwnerUser, revokeSession } from '../services/auth.service.js';
import { getOrCreateDirect } from '../services/chat.service.js';
import { isEmailConfigured, sendEmail } from '../services/email/mailer.js';
import { verificationEmail } from '../services/email/templates.js';
import { isUserOnline } from '../services/realtime.js';
import { hashCode, randomCode, safeEqualHex } from '../utils/security.js';
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
    const [[blocked]] = await pool.query("SELECT COUNT(*) AS n FROM chat_users WHERE email = ? AND status = 'blocked'", [
      data.email,
    ]);
    if (Number(blocked.n) > 0) {
      return res.status(403).json({ ok: false, message: 'This email cannot start a chat. Please use the contact form instead.' });
    }

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
