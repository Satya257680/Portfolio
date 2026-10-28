// `npm run db:init` / `npm run db:migrate`
// Applies all idempotent migrations (contact_messages + chat tables). Existing data is kept.
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { getTlsOptions } from '../db.js';
import { runMigrations } from '../migrations.js';

async function main() {
  const { database, ...conn } = config.db;
  const ssl = getTlsOptions();
  const connection = await mysql.createConnection({
    ...conn,
    ...(ssl ? { ssl } : {}),
  });

  try {
    // TiDB users may not have CREATE DATABASE privileges. The database should
    // already exist in TiDB Cloud; create only the application tables.
    await connection.changeUser({ database });
    await connection.query("SET time_zone = '+00:00'");
    await runMigrations(connection, (msg) => console.log(msg));
    console.log(`[db:init] tables are ready in database "${database}"`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('[db:init] failed:', err.code || err.name, err.message);
  process.exit(1);
});
