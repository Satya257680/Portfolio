import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

// True when the database is reachable and the contact table exists.
export async function isDatabaseReady() {
  if (!config.db.user) return false;
  try {
    const [rows] = await getPool().query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
      [config.db.database, 'contact_messages'],
    );
    return rows[0].n > 0;
  } catch {
    return false;
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
