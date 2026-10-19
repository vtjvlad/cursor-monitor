import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { requireAuth } from './security/auth.js';
import healthRouter from './routes/health.js';
import sessionsRouter from './routes/sessions.js';
import agentRouter from './routes/agent.js';
const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', requireAuth, healthRouter);
app.use('/api/sessions', requireAuth, sessionsRouter);
app.use('/api/agent', requireAuth, agentRouter);
app.use(express.static(publicDir, {
  index: 'index.html',
  dotfiles: 'deny',
  etag: true,
  maxAge: 0
}));
app.use((error, _req, res, _next) => {
  console.error('[monitor]', error.message);
  res.status(500).json({ error: 'Internal monitor error' });
});
app.listen(config.port, config.host, () => {
  console.log(`Cursor Monitor listening on http://${config.host}:${config.port}`);
});
