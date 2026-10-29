import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, getPool, isChatReady, isDatabaseReady } from './db.js';
import { runMigrations } from './migrations.js';
import { bootstrapAdminFromEnv, ensureOwnerUser } from './services/auth.service.js';
import { getEmailConfigIssues, isEmailConfigured, redactEmail } from './services/email/mailer.js';
import { attachRealtime, closeRealtime } from './services/realtime.js';

const app = createApp();
const server = http.createServer(app);
attachRealtime(server);

// Startup hint for password-reset problems: a reset code is only emailed to an ACTIVE row in
// admin_users, so log how many exist (addresses redacted). No secrets are printed.
async function logAdminAccounts() {
  if (!(await isChatReady())) return;
  try {
    const [rows] = await getPool().query('SELECT email FROM admin_users WHERE is_active = 1 ORDER BY id LIMIT 5');
    console.log(
      rows.length
        ? `[admin] active admin accounts: ${rows.length} (${rows.map((r) => redactEmail(r.email)).join(', ')})`
        : '[admin] no active admin account — create one with `npm run admin:create` (password reset will not send email)',
    );
  } catch (err) {
    console.error('[admin] could not read admin accounts:', err.code || err.name);
  }
}

async function prepareDatabase() {
  if (!config.db.user) return;
  try {
    if (config.autoMigrate) await runMigrations(getPool());
    if (await isChatReady()) {
      await ensureOwnerUser();
      await bootstrapAdminFromEnv();
    }
  } catch (err) {
    console.error('[server] database preparation failed:', err.code || err.name, err.message);
  }
}

server.listen(config.port, async () => {
  console.log(`[server] listening on http://localhost:${config.port} (${config.env})`);
  await prepareDatabase();
  const ready = await isDatabaseReady();
  console.log(
    ready
      ? '[server] MySQL connected — contact form enabled'
      : '[server] MySQL not ready — the site will show an email button instead of the form (see README)',
  );
  console.log(
    (await isChatReady())
      ? '[server] Chat tables ready — live chat enabled'
      : '[server] Chat tables missing — run `npm run db:migrate` (or keep AUTO_MIGRATE=true)',
  );
  console.log(
    isEmailConfigured()
      ? `[server] Email provider: ${config.email.provider}`
      : '[server] No email provider configured — notifications are NOT being sent (see README › Email)',
  );
  // A provider name alone does not prove emails can be sent: report missing/invalid settings by name.
  for (const issue of getEmailConfigIssues()) console.warn(`[server] Email config warning: ${issue}`);
  if (isEmailConfigured()) {
    const sender = config.email.from.match(/<([^>]+)>/)?.[1] || config.email.from;
    console.log(`[server] Email sender (MAIL_FROM): ${sender.trim()} — this address must be a verified sender in ${config.email.provider}`);
  }
  if (config.db.user) await logAdminAccounts();
});

const shutdown = async () => {
  await closeRealtime().catch(() => {});
  server.close();
  await closePool();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
