import 'dotenv/config';

const int = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

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
};
