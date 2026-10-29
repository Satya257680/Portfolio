// One-time admin setup:  ADMIN_EMAIL=satyajit.it.2026@gmail.com ADMIN_PASSWORD='long-password' npm run admin:create
// Creates the admin, or resets the password if the email already exists. Never seeds a default password.
// ADMIN_EMAIL must equal ADMIN_OWNER_EMAIL (default: the owner email) — no other account can be an admin.
// Only a salted scrypt hash is stored; the password itself is never printed or logged.
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { getTlsOptions } from '../db.js';
import { runMigrations } from '../migrations.js';
import { hashPassword } from '../utils/security.js';

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email address.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  // Only the portfolio owner may be an admin (server-enforced on every request as well).
  if (email !== config.admin.ownerEmail) {
    throw new Error(`ADMIN_EMAIL must be the owner admin email (${config.admin.ownerEmail}). Set ADMIN_OWNER_EMAIL to change it.`);
  }

  const { database, ...conn } = config.db;
  const ssl = getTlsOptions();
  const connection = await mysql.createConnection({ ...conn, database, ...(ssl ? { ssl } : {}) });
  try {
    await connection.query("SET time_zone = '+00:00'");
    await runMigrations(connection, () => {});
    const hash = await hashPassword(password);
    await connection.query(
      `INSERT INTO admin_users (email, password_hash, role, is_active) VALUES (?, ?, 'owner', 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1, updated_at = UTC_TIMESTAMP()`,
      [email, hash],
    );
    // Existing admin sessions are revoked so a password reset signs out other devices.
    await connection.query(
      "UPDATE chat_sessions SET revoked_at = UTC_TIMESTAMP() WHERE kind = 'admin' AND revoked_at IS NULL",
    );
    console.log(`[admin:create] admin ready for ${email}. Sign in at ${config.appBaseUrl}/admin`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('[admin:create] failed:', err.message);
  process.exit(1);
});
