import { config } from '../config.js';
import { getPool, isDatabaseReady } from '../db.js';
import { validateContact } from '../validators/contact.validator.js';

// GET /api/contact/status — lets the frontend show the form only when it can really be stored.
export async function contactStatus(req, res) {
  const enabled = config.contactEnabled && (await isDatabaseReady());
  res.json({ enabled });
}

// POST /api/contact — validate, then store with a parameterised query.
export async function createContact(req, res, next) {
  try {
    if (!config.contactEnabled) {
      return res.status(503).json({ ok: false, message: 'The contact form is disabled. Please use email instead.' });
    }

    // Honeypot: real visitors never fill this hidden field. Pretend nothing happened but store nothing.
    if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
      return res.status(400).json({ ok: false, message: 'Message rejected.' });
    }

    const { data, errors, valid } = validateContact(req.body);
    if (!valid) {
      return res.status(422).json({ ok: false, message: 'Please correct the highlighted fields.', errors });
    }

    const ip = (req.ip || '').slice(0, 45);
    const ua = String(req.get('user-agent') || '').slice(0, 255);

    const [result] = await getPool().execute(
      `INSERT INTO contact_messages (name, email, subject, message, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.email, data.subject || null, data.message, ip || null, ua || null],
    );

    return res.status(201).json({ ok: true, id: result.insertId, message: 'Message received.' });
  } catch (err) {
    // Database unreachable or table missing → 503 with a clear message (no fake success).
    if (err && (err.code === 'ECONNREFUSED' || err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR')) {
      return res
        .status(503)
        .json({ ok: false, message: 'The message service is unavailable right now. Please email me directly.' });
    }
    return next(err);
  }
}
