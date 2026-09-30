require('dotenv').config();

const path = require('path');
const express = require('express');
const config = require('./src/config');
const { storeName } = require('./src/db/gameStore');
const { HttpError } = require('./src/utils/httpError');
const gameRoutes = require('./src/routes/gameRoutes');
const quizRoutes = require('./src/routes/quizRoutes');
const leaderboardRoutes = require('./src/routes/leaderboardRoutes');

const PUBLIC_DIR = path.join(__dirname, 'public');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  // Basic hardening headers (no extra dependency needed).
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // API responses must never be cached: they contain live game state.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'devops-pipeline-puzzle',
      leaderboardEnabled: config.leaderboardEnabled
    });
  });

  app.use('/api/game', gameRoutes);
  app.use('/api/game', quizRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);

  // Unknown API routes get JSON, not the HTML page.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Frontend: public/index.html, styles.css, app.js
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // Central error handler: safe JSON for players, details in the server log.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'The request is too large.' });
    }
    if (err instanceof HttpError) {
      if (err.status >= 500) console.error(`[api] ${req.method} ${req.originalUrl}:`, err.cause || err.message);
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    console.error(`[api] ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({ error: 'Unable to process request' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`DevOps Pipeline Puzzle running on http://localhost:${port} (store: ${storeName})`);
  });
}

module.exports = { createApp };
