import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, isDatabaseReady } from './db.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(`[server] listening on http://localhost:${config.port} (${config.env})`);
  const ready = await isDatabaseReady();
  console.log(
    ready
      ? '[server] MySQL connected — contact form enabled'
      : '[server] MySQL not ready — the site will show an email button instead of the form (see README)',
  );
});

const shutdown = async () => {
  server.close();
  await closePool();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
