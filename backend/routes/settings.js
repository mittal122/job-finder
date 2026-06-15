const express = require('express');
const router = express.Router();
const { pool } = require('../db');

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [key]);
  return rows[0]?.value || '';
}

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const key = await getSetting('nvidia_api_key');
    const masked = key.length > 8 ? key.slice(0, 8) + '••••••••' + key.slice(-4) : (key ? '••••••••' : '');
    res.json({ nvidia_api_key: masked, configured: !!key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  const { nvidia_api_key } = req.body;
  if (!nvidia_api_key || typeof nvidia_api_key !== 'string' || !nvidia_api_key.trim()) {
    return res.status(400).json({ error: 'nvidia_api_key is required' });
  }
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('nvidia_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [nvidia_api_key.trim()]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, getSetting };
