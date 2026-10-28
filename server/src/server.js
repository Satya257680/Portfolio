import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, getPool, isChatReady, isDatabaseReady } from './db.js';
import { runMigrations } from './migrations.js';
import { bootstrapAdminFromEnv, ensureOwnerUser } from './services/auth.service.js';
import { isEmailConfigured } from './services/email/mailer.js';
import { attachRealtime, closeRealtime } from './services/realtime.js';

const app = createApp();
const server = http.createServer(app);
attachRealtime(server);

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
});

const shutdown = async () => {
  await closeRealtime().catch(() => {});
  server.close();
  await closePool();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
