const express = require('express');
const router = express.Router();
const { getSetting, setSetting } = require('../services/settingsService');

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
    await setSetting('nvidia_api_key', nvidia_api_key.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
