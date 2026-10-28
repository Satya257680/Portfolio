import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTlsOptions() {
  const configuredCaPath = process.env.DB_SSL_CA;
  const configuredCaContent = process.env.DB_SSL_CA_CONTENT;
  const defaultCaPath = path.resolve(__dirname, '../../certs/tidb-ca.pem');

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
  const connection = await mysql.createConnection({
    ...conn,
    ssl: getTlsOptions(),
  });

  try {
    // TiDB users may not have CREATE DATABASE privileges. The database should
    // already exist in TiDB Cloud; create only the application table.
    await connection.changeUser({ database });
    await connection.query(TABLE_SQL);
    console.log(`[db:init] table contact_messages is ready in database "${database}"`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('[db:init] failed:', err.code || err.name, err.message);
  process.exit(1);
});
