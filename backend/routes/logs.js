const express = require('express');
const router = express.Router();
const { addClient, removeClient, getBuffer } = require('../services/logger');
const { requireAdmin } = require('../middleware/requireAuth');

// Admin-only: this is a single global backend console, not scoped per
// tenant — any logged-in account would otherwise see every other
// account's recipient emails and error details in the log lines.
router.use(requireAdmin);

// GET /api/logs — last N entries as JSON
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  res.json(getBuffer().slice(-limit));
});

// GET /api/logs/stream — SSE real-time stream
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addClient(res);

  // Heartbeat every 15s to keep connection alive
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); }
  }, 15000);

  req.on('close', () => { clearInterval(hb); removeClient(res); });
});

module.exports = router;
