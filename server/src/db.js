import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTlsOptions() {
  // TiDB Cloud public endpoints require TLS. Prefer a supplied CA certificate
  // when configured; otherwise Node.js verifies against its trusted CA store.
  const configuredCaPath = process.env.DB_SSL_CA;
  const configuredCaContent = process.env.DB_SSL_CA_CONTENT;
  const defaultCaPath = path.resolve(__dirname, '../certs/tidb-ca.pem');

  let ca;
  if (configuredCaContent) {
    ca = configuredCaContent.replace(/\\n/g, '\n');
  } else if (configuredCaPath && fs.existsSync(configuredCaPath)) {
    ca = fs.readFileSync(configuredCaPath, 'utf8');
  } else if (fs.existsSync(defaultCaPath)) {
    ca = fs.readFileSync(defaultCaPath, 'utf8');
  }

  return {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}

let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      ssl: getTlsOptions(),
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

// True when the database is reachable and the contact table exists.
export async function isDatabaseReady() {
  if (!config.db.user) {
    console.error('[database] DB_USER is not configured.');
    return false;
  }

  try {
    const [rows] = await getPool().query(
      `SELECT COUNT(*) AS n
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
      [config.db.database, 'contact_messages'],
    );
    return Number(rows[0].n) > 0;
  } catch (error) {
    // Log diagnostic information without logging connection credentials.
    console.error('[database] Connection check failed:', error.code || error.name, error.message);
    return false;
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
