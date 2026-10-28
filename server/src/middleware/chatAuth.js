import { resolveSession } from '../services/auth.service.js';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// Requires a valid visitor or admin session. Sets req.auth.
export async function requireChatAuth(req, res, next) {
  try {
    const auth = await resolveSession(bearer(req));
    if (!auth) return res.status(401).json({ ok: false, message: 'Please verify your email to continue.' });
    req.auth = auth;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Requires an admin session (owner signed in with password). Server-side check on every request.
export async function requireAdmin(req, res, next) {
  try {
    const auth = await resolveSession(bearer(req));
    if (!auth || !auth.isAdmin) return res.status(401).json({ ok: false, message: 'Admin sign-in required.' });
    req.auth = auth;
    return next();
  } catch (err) {
    return next(err);
  }
}
