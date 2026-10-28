import 'dotenv/config';

const int = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v, fallback) => {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(v).trim().toLowerCase());
};

const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

const ownerEmail = (process.env.CONTACT_NOTIFICATION_EMAIL || 'satyajit.it.2026@gmail.com').trim().toLowerCase();

// Pick the email provider explicitly, or infer it from whichever credentials are present.
function detectEmailProvider() {
  const explicit = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'log';
}

export const config = {
  port: int(process.env.PORT, 5000),
  env: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: int(process.env.TRUST_PROXY, 0),
  contactEnabled: (process.env.CONTACT_FORM_ENABLED || 'true').toLowerCase() !== 'false',
  rateLimit: {
    max: int(process.env.CONTACT_RATE_LIMIT_MAX, 5),
    windowMs: int(process.env.CONTACT_RATE_LIMIT_WINDOW_MIN, 15) * 60 * 1000,
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME || 'portfolio',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
  },
  // Run idempotent schema migrations when the server starts (safe: CREATE TABLE IF NOT EXISTS only).
  autoMigrate: bool(process.env.AUTO_MIGRATE, true),

  // Public site URL used for links inside emails (no trailing slash).
  appBaseUrl: trimSlash(process.env.APP_BASE_URL || 'https://satyajitnayak-portfolio.pages.dev'),

  owner: {
    name: process.env.OWNER_NAME || 'Satyajit Nayak',
    email: ownerEmail,
  },

  chat: {
    enabled: bool(process.env.CHAT_ENABLED, true),
    visitorSessionDays: int(process.env.CHAT_SESSION_DAYS, 30),
    adminSessionHours: int(process.env.ADMIN_SESSION_HOURS, 12),
    codeTtlMinutes: int(process.env.CHAT_CODE_TTL_MIN, 10),
    codeMaxAttempts: int(process.env.CHAT_CODE_MAX_ATTEMPTS, 5),
    codesPerEmailPerWindow: int(process.env.CHAT_CODES_PER_EMAIL, 3),
    messageMaxLength: int(process.env.CHAT_MESSAGE_MAX, 2000),
    // Minimum seconds between two notification emails for the same conversation + recipient.
    notifyCooldownSec: int(process.env.CHAT_NOTIFY_COOLDOWN_SEC, 60),
    // Include a short preview of the message text in notification emails (as in the design).
    emailIncludeMessage: bool(process.env.CHAT_EMAIL_INCLUDE_MESSAGE, true),
    emailPreviewChars: int(process.env.CHAT_EMAIL_PREVIEW_CHARS, 400),
  },

  email: {
    provider: detectEmailProvider(),
    from: process.env.MAIL_FROM || 'Portfolio Chat <onboarding@resend.dev>',
    resendApiKey: process.env.RESEND_API_KEY || '',
    brevoApiKey: process.env.BREVO_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: int(process.env.SMTP_PORT, 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    timeZone: process.env.NOTIFY_TIMEZONE || 'Asia/Kolkata',
    sendContactReceipt: bool(process.env.CONTACT_SEND_RECEIPT, true),
  },

  admin: {
    // Optional one-time bootstrap: used only when no admin user exists yet.
    bootstrapEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    bootstrapPassword: process.env.ADMIN_PASSWORD || '',
  },
};

export const isProduction = () => config.env === 'production';
