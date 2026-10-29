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

// "satyajit.it.2026@gmail.com" -> "sa***@gmail.com". Used for every email address that reaches the logs.
export function redactEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return '[invalid-address]';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

// One JSON line per event so Render's log search can filter on "event". Never pass codes, subjects,
// message bodies, passwords or API keys to this function.
export function logEvent(event, fields = {}, level = 'info') {
  const line = JSON.stringify({ event, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const sanitizeError = (err) =>
  String(err?.message || err || 'Unknown error')
    .replace(/(api[-_ ]?key|authorization|bearer)\S*/gi, '[redacted]')
    .replace(/re_[A-Za-z0-9_]{8,}/g, '[redacted]')
    .replace(/xkeysib-[A-Za-z0-9-]+/g, '[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => redactEmail(m))
    .slice(0, 250);

// Failure categories used in logs and in the result of sendEmail():
//   not_configured | provider_rejected | rate_limited | provider_error | timeout | network
class SendError extends Error {
  constructor(message, { transient = false, category = 'provider_error', httpStatus = null } = {}) {
    super(message);
    this.transient = transient;
    this.category = category;
    this.httpStatus = httpStatus;
  }
}

const categoryForStatus = (status) =>
  status === 429 ? 'rate_limited' : status >= 500 ? 'provider_error' : 'provider_rejected';

// Every provider HTTP call is bounded, so a hanging provider cannot hold the API request open.
const requestTimeoutMs = () => {
  const n = Number.parseInt(process.env.EMAIL_TIMEOUT_MS, 10);
  return Number.isFinite(n) && n > 0 ? n : 10000;
};

async function providerFetch(provider, url, options) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(requestTimeoutMs()) });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new SendError(`${provider}: request timed out after ${requestTimeoutMs()} ms`, { transient: true, category: 'timeout' });
    }
    throw new SendError(`${provider}: network error (${err?.cause?.code || err?.name || 'fetch failed'})`, {
      transient: true,
      category: 'network',
    });
  }
}

async function sendViaResend(msg) {
  const res = await providerFetch('Resend', 'https://api.resend.com/emails', {
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
      category: categoryForStatus(res.status),
      httpStatus: res.status,
    });
  }
  return data?.id || null;
}

async function sendViaBrevo(msg) {
  const from = parseAddress(config.email.from);
  const res = await providerFetch('Brevo', 'https://api.brevo.com/v3/smtp/email', {
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
    // 400 "Sender is not valid" / "unauthorized sender" means MAIL_FROM is not a verified Brevo sender;
    // 401 means BREVO_API_KEY is wrong or revoked. Both are permanent and are not retried.
    throw new SendError(`Brevo ${res.status}: ${data?.code ? `${data.code} - ` : ''}${data?.message || 'request failed'}`, {
      transient: res.status === 429 || res.status >= 500,
      category: categoryForStatus(res.status),
      httpStatus: res.status,
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
      category: !code ? 'network' : code >= 500 ? 'provider_rejected' : 'provider_error',
      httpStatus: code || null,
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

/**
 * Human-readable configuration problems (no secret values). Logged once at startup and with every
 * failed send so a missing/misnamed Render variable is visible in the application logs.
 */
export function getEmailConfigIssues() {
  const { provider, from } = config.email;
  const issues = [];
  if (!['resend', 'brevo', 'smtp', 'log'].includes(provider)) issues.push(`EMAIL_PROVIDER "${provider}" is not supported (use resend, brevo or smtp)`);
  if (provider === 'log') issues.push('no email provider configured (set EMAIL_PROVIDER and its credentials)');
  if (provider === 'brevo' && !config.email.brevoApiKey) issues.push('BREVO_API_KEY is not set');
  if (provider === 'resend' && !config.email.resendApiKey) issues.push('RESEND_API_KEY is not set');
  if (provider === 'smtp' && !config.email.smtp.host) issues.push('SMTP_HOST is not set');
  if (provider !== 'log') {
    if (!process.env.MAIL_FROM) issues.push('MAIL_FROM is not set (falling back to the Resend test sender)');
    const sender = parseAddress(from).email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sender)) issues.push('MAIL_FROM does not contain a valid sender address');
    else if (provider !== 'resend' && /@resend\.dev$/i.test(sender)) {
      issues.push(`MAIL_FROM uses a resend.dev address, which ${provider} will reject; use a sender verified in ${provider}`);
    }
  }
  return issues;
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
 * Sends one email. Resolves to
 *   { status: 'sent' | 'failed' | 'skipped', providerMessageId?, error?, category?, httpStatus?, attempts }.
 * Never throws. "sent" means the provider ACCEPTED the message — not that it reached the inbox
 * (check the provider's transactional log for delivered / deferred / bounced / blocked).
 * Each outcome is also written as one redacted JSON log line ("email.send").
 */
export async function sendEmail(msg) {
  const base = { kind: msg.kind, provider: config.email.provider, to: redactEmail(msg.to), relatedId: msg.relatedId || null };
  if (!isEmailConfigured()) {
    if (config.env !== 'production') {
      console.log(`[email:log] (not sent — no provider configured) to=${msg.to} subject="${msg.subject}"`);
      if (msg.devPreview) console.log(`[email:log] ${msg.devPreview}`);
    }
    const error = 'Email provider not configured';
    logEvent('email.send', { ...base, status: 'skipped', category: 'not_configured', issues: getEmailConfigIssues() }, config.env === 'production' ? 'error' : 'warn');
    await writeLog({ ...msg, recipient: msg.to, status: 'skipped', error });
    return { status: 'skipped', category: 'not_configured', error, attempts: 0 };
  }

  const delays = [0, 1500, 4000];
  let lastErr = null;
  let attempts = 0;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    attempts += 1;
    try {
      const providerMessageId = await deliverOnce(msg);
      logEvent('email.send', { ...base, status: 'sent', providerMessageId: providerMessageId || null, attempts });
      await writeLog({ ...msg, recipient: msg.to, status: 'sent', providerMessageId, attempts });
      return { status: 'sent', providerMessageId, attempts };
    } catch (err) {
      lastErr = err;
      // Network errors, timeouts and 429/5xx are retried; 4xx are permanent.
      const transient = err instanceof SendError ? err.transient : true;
      if (!transient) break;
    }
  }
  const error = sanitizeError(lastErr);
  const category = lastErr instanceof SendError ? lastErr.category : 'network';
  const httpStatus = lastErr instanceof SendError ? lastErr.httpStatus : null;
  const issues = getEmailConfigIssues();
  logEvent('email.send', { ...base, status: 'failed', category, httpStatus, attempts, error, ...(issues.length ? { issues } : {}) }, 'error');
  await writeLog({ ...msg, recipient: msg.to, status: 'failed', error, attempts });
  return { status: 'failed', error, category, httpStatus, attempts };
}

// Fire-and-forget helper for notifications that must not delay the API response.
export function sendEmailInBackground(msg) {
  sendEmail(msg).catch((err) => console.error('[email] unexpected error:', err?.message));
}
