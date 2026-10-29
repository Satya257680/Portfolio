// Versioned, idempotent schema migrations (MySQL 8 / TiDB / MariaDB compatible).
// Every statement uses CREATE TABLE IF NOT EXISTS, so running them again is safe and
// existing data — in particular contact_messages — is never dropped or rewritten.

const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

export const migrations = [
  {
    id: '001_contact_messages',
    statements: [
      `CREATE TABLE IF NOT EXISTS contact_messages (
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
      ) ${T}`,
    ],
  },
  {
    id: '002_admin_and_email_logs',
    statements: [
      `CREATE TABLE IF NOT EXISTS admin_users (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        email          VARCHAR(150) NOT NULL,
        password_hash  VARCHAR(255) NOT NULL,
        role           VARCHAR(20)  NOT NULL DEFAULT 'owner',
        is_active      TINYINT(1)   NOT NULL DEFAULT 1,
        last_login_at  DATETIME     NULL,
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_admin_email (email)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS email_delivery_logs (
        id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        kind                 VARCHAR(40)  NOT NULL,
        recipient            VARCHAR(150) NOT NULL,
        provider             VARCHAR(20)  NOT NULL,
        provider_message_id  VARCHAR(191) NULL,
        status               VARCHAR(20)  NOT NULL,
        error_summary        VARCHAR(255) NULL,
        attempts             TINYINT UNSIGNED NOT NULL DEFAULT 0,
        related_type         VARCHAR(30)  NULL,
        related_id           BIGINT UNSIGNED NULL,
        created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_email_log_created (created_at),
        KEY idx_email_log_related (related_type, related_id)
      ) ${T}`,
    ],
  },
  {
    id: '003_chat_core',
    statements: [
      `CREATE TABLE IF NOT EXISTS chat_users (
        id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
        display_name       VARCHAR(100) NOT NULL,
        email              VARCHAR(150) NOT NULL,
        email_verified_at  DATETIME     NULL,
        is_owner           TINYINT(1)   NOT NULL DEFAULT 0,
        status             VARCHAR(20)  NOT NULL DEFAULT 'active',
        created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_chat_user_email (email),
        KEY idx_chat_user_owner (is_owner)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS chat_verification_codes (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        email         VARCHAR(150) NOT NULL,
        display_name  VARCHAR(100) NOT NULL,
        code_hash     CHAR(64)     NOT NULL,
        purpose       VARCHAR(20)  NOT NULL DEFAULT 'chat_login',
        attempts      TINYINT UNSIGNED NOT NULL DEFAULT 0,
        expires_at    DATETIME     NOT NULL,
        used_at       DATETIME     NULL,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_code_email (email, purpose, created_at),
        KEY idx_code_expiry (expires_at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS chat_sessions (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id        INT UNSIGNED NOT NULL,
        token_hash     CHAR(64)     NOT NULL,
        kind           VARCHAR(10)  NOT NULL DEFAULT 'visitor',
        admin_user_id  INT UNSIGNED NULL,
        expires_at     DATETIME     NOT NULL,
        revoked_at     DATETIME     NULL,
        last_used_at   DATETIME     NULL,
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_session_token (token_hash),
        KEY idx_session_user (user_id),
        CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES chat_users (id) ON DELETE CASCADE
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS chat_conversations (
        id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        type             VARCHAR(10)  NOT NULL,
        direct_key       VARCHAR(40)  NULL,
        title            VARCHAR(100) NULL,
        description      VARCHAR(300) NULL,
        status           VARCHAR(20)  NOT NULL DEFAULT 'open',
        created_by       INT UNSIGNED NOT NULL,
        last_message_id  BIGINT UNSIGNED NULL,
        last_message_at  DATETIME     NULL,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_conversation_direct (direct_key),
        KEY idx_conversation_last (last_message_at),
        CONSTRAINT fk_conversation_creator FOREIGN KEY (created_by) REFERENCES chat_users (id)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS chat_conversation_members (
        conversation_id       INT UNSIGNED NOT NULL,
        user_id               INT UNSIGNED NOT NULL,
        role                  VARCHAR(10)  NOT NULL DEFAULT 'member',
        joined_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        left_at               DATETIME     NULL,
        last_read_message_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
        muted_until           DATETIME     NULL,
        PRIMARY KEY (conversation_id, user_id),
        KEY idx_member_user (user_id, left_at),
        CONSTRAINT fk_member_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
        CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES chat_users (id) ON DELETE CASCADE
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        conversation_id    INT UNSIGNED NOT NULL,
        sender_id          INT UNSIGNED NOT NULL,
        body               TEXT         NOT NULL,
        message_type       VARCHAR(10)  NOT NULL DEFAULT 'text',
        client_message_id  VARCHAR(64)  NULL,
        created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        edited_at          DATETIME     NULL,
        deleted_at         DATETIME     NULL,
        PRIMARY KEY (id),
        KEY idx_message_conversation (conversation_id, id),
        UNIQUE KEY uq_message_client (sender_id, client_message_id),
        CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
        CONSTRAINT fk_message_sender FOREIGN KEY (sender_id) REFERENCES chat_users (id)
      ) ${T}`,
    ],
  },
  {
    id: '004_chat_moderation',
    statements: [
      `CREATE TABLE IF NOT EXISTS chat_reports (
        id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        conversation_id   INT UNSIGNED NOT NULL,
        reporter_id       INT UNSIGNED NOT NULL,
        reason            VARCHAR(500) NOT NULL,
        status            VARCHAR(20)  NOT NULL DEFAULT 'open',
        created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_report_created (created_at)
      ) ${T}`,
      `CREATE TABLE IF NOT EXISTS chat_audit_logs (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_user_id  INT UNSIGNED NULL,
        action         VARCHAR(50)  NOT NULL,
        target_type    VARCHAR(30)  NULL,
        target_id      BIGINT UNSIGNED NULL,
        details        VARCHAR(500) NULL,
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_audit_created (created_at)
      ) ${T}`,
    ],
  },
  {
    id: '005_chat_passwords_and_attachments',
    statements: [
      `CREATE TABLE IF NOT EXISTS chat_attachments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        conversation_id INT UNSIGNED NOT NULL,
        message_id BIGINT UNSIGNED NOT NULL,
        sender_id INT UNSIGNED NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(150) NOT NULL,
        file_size INT UNSIGNED NOT NULL,
        file_data LONGBLOB NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_attachment_conversation (conversation_id, id),
        UNIQUE KEY uq_attachment_message (message_id),
        CONSTRAINT fk_attachment_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
        CONSTRAINT fk_attachment_message FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE,
        CONSTRAINT fk_attachment_sender FOREIGN KEY (sender_id) REFERENCES chat_users (id) ON DELETE CASCADE
      ) ${T}`
    ],
  }

];

// Applies pending migrations in order and records them in schema_migrations.
export async function runMigrations(conn, log = console.log) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id          VARCHAR(100) NOT NULL,
      applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ${T}`,
  );
  const [rows] = await conn.query('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));
  const ran = [];
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    if (m.id === '005_chat_passwords_and_attachments') {
      const [cols] = await conn.query(
        `SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_users' AND column_name = 'password_hash'`,
      );
      if (Number(cols[0].n) === 0) await conn.query('ALTER TABLE chat_users ADD COLUMN password_hash VARCHAR(255) NULL');
    }
    for (const sql of m.statements) {
      await conn.query(sql);
    }
    await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
    ran.push(m.id);
    log(`[migrate] applied ${m.id}`);
  }
  if (!ran.length) log('[migrate] schema is up to date');
  return ran;
}
