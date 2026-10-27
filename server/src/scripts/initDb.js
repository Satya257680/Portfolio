// Creates the contact_messages table using the credentials in server/.env.
// The database itself must already exist (or the user must be allowed to create it).
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS contact_messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL,
  subject     VARCHAR(150)  NULL,
  message     TEXT          NOT NULL,
  ip_address  VARCHAR(45)   NULL,
  user_agent  VARCHAR(255)  NULL,
  is_read     TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contact_created (created_at),
  KEY idx_contact_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

async function main() {
  const { database, ...conn } = config.db;
  const connection = await mysql.createConnection(conn);
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } catch (e) {
    console.warn(`[db:init] could not create database (it may already exist): ${e.code}`);
  }
  await connection.changeUser({ database });
  await connection.query(TABLE_SQL);
  console.log(`[db:init] table contact_messages is ready in database "${database}"`);
  await connection.end();
}

main().catch((err) => {
  console.error('[db:init] failed:', err.code || err.message);
  process.exit(1);
});
