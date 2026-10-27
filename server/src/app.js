import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { isDatabaseReady } from './db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import contactRoutes from './routes/contact.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          scriptSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', async (req, res) => {
    res.json({ ok: true, database: await isDatabaseReady() });
  });
  app.use('/api/contact', contactRoutes);
  app.use('/api', notFound);

  // Serve the built React app (after `npm run build`).
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '7d', index: false }));
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
