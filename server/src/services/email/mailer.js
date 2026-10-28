// Transactional email delivery with provider abstraction, retries and a sanitised delivery log.
// Providers: resend (HTTPS API), brevo (HTTPS API), smtp (nodemailer), log (development only —
// prints to the console and records status "skipped"; it never reports an email as sent).
import { config } from '../../config.js';
import { getPool } from '../../db.js';

let smtpTransport = null;

function parseAddress(value) {
  const m = String(value || '').match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim() };
  return { name: '', email: String(value || '').trim() };
}

const sanitizeError = (err) =>
  String(err?.message || err || 'Unknown error')
    .replace(/(api[-_ ]?key|authorization|bearer)\S*/gi, '[redacted]')
    .replace(/re_[A-Za-z0-9_]{8,}/g, '[redacted]')
    .replace(/xkeysib-[A-Za-z0-9-]+/g, '[redacted]')
    .slice(0, 250);

class SendError extends Error {
  constructor(message, { transient = false } = {}) {
    super(message);
    this.transient = transient;
  }
}

async function sendViaResend(msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      'Content-Type': 'application/json',
      ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: config.email.from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SendError(`Resend ${res.status}: ${data?.message || data?.name || 'request failed'}`, {
      transient: res.status === 429 || res.status >= 500,
    });
  }
  return data?.id || null;
}

async function sendViaBrevo(msg) {
  const from = parseAddress(config.email.from);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.email.brevoApiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SendError(`Brevo ${res.status}: ${data?.message || data?.code || 'request failed'}`, {
      transient: res.status === 429 || res.status >= 500,
    });
  }
  return data?.messageId || null;
}

async function sendViaSmtp(msg) {
  if (!smtpTransport) {
    const nodemailer = (await import('nodemailer')).default;
    smtpTransport = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.user ? { user: config.email.smtp.user, pass: config.email.smtp.pass } : undefined,
    });
  }
  try {
    const info = await smtpTransport.sendMail({
      from: config.email.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    return info?.messageId || null;
  } catch (err) {
    const code = Number(err?.responseCode) || 0;
    throw new SendError(`SMTP: ${err?.message || 'send failed'}`, {
      // No SMTP code = connection/network problem; 4xx SMTP replies are temporary, 5xx are permanent.
      transient: !code || (code >= 400 && code < 500),
    });
  }
}

export function isEmailConfigured() {
  const p = config.email.provider;
  if (p === 'resend') return Boolean(config.email.resendApiKey);
  if (p === 'brevo') return Boolean(config.email.brevoApiKey);
  if (p === 'smtp') return Boolean(config.email.smtp.host);
  return false;
}

async function deliverOnce(msg) {
  switch (config.email.provider) {
    case 'resend':
      return sendViaResend(msg);
    case 'brevo':
      return sendViaBrevo(msg);
    case 'smtp':
      return sendViaSmtp(msg);
    default:
      return null;
  }
}

async function writeLog(entry) {
  try {
    const [r] = await getPool().query(
      `INSERT INTO email_delivery_logs
        (kind, recipient, provider, provider_message_id, status, error_summary, attempts, related_type, related_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.kind,
        String(entry.recipient).slice(0, 150),
        config.email.provider,
        entry.providerMessageId ? String(entry.providerMessageId).slice(0, 191) : null,
        entry.status,
        entry.error || null,
        entry.attempts || 0,
        entry.relatedType || null,
        entry.relatedId || null,
      ],
    );
    return r.insertId;
  } catch (err) {
    // Logging must never break delivery.
    console.error('[email] could not write delivery log:', err.code || err.name);
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one email. Resolves to { status: 'sent' | 'failed' | 'skipped', providerMessageId?, error? }.
 * Never throws. "sent" is returned only when the provider accepted the message.
 */
export async function sendEmail(msg) {
  if (!isEmailConfigured()) {
    if (config.env !== 'production') {
      console.log(`[email:log] (not sent — no provider configured) to=${msg.to} subject="${msg.subject}"`);
      if (msg.devPreview) console.log(`[email:log] ${msg.devPreview}`);
    } else {
      console.error('[email] no email provider configured; message not sent:', msg.kind);
    }
    await writeLog({ ...msg, recipient: msg.to, status: 'skipped', error: 'Email provider not configured' });
    return { status: 'skipped' };
  }

  const delays = [0, 1500, 4000];
  let lastErr = null;
  let attempts = 0;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    attempts += 1;
    try {
      const providerMessageId = await deliverOnce(msg);
      await writeLog({ ...msg, recipient: msg.to, status: 'sent', providerMessageId, attempts });
      return { status: 'sent', providerMessageId };
    } catch (err) {
      lastErr = err;
      // Network errors (fetch TypeError) and 429/5xx are retried; 4xx are permanent.
      const transient = err instanceof SendError ? err.transient : true;
      if (!transient) break;
    }
  }
  const error = sanitizeError(lastErr);
  console.error(`[email] delivery failed (${msg.kind}):`, error);
  await writeLog({ ...msg, recipient: msg.to, status: 'failed', error, attempts });
  return { status: 'failed', error };
}

// Fire-and-forget helper for notifications that must not delay the API response.
export function sendEmailInBackground(msg) {
  sendEmail(msg).catch((err) => console.error('[email] unexpected error:', err?.message));
}
