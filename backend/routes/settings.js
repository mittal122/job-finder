const express = require('express');
const router = express.Router();
const { getSetting, setSetting } = require('../services/settingsService');
const { sendTestEmail } = require('../services/emailService');

function mask(value) {
  if (!value) return '';
  return value.length > 8 ? value.slice(0, 4) + '••••••••' + value.slice(-4) : '••••••••';
}

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const [nvidiaKey, gmailAddress, gmailAppPassword, delayMin, delayMax] = await Promise.all([
      getSetting(userId, 'nvidia_api_key'),
      getSetting(userId, 'gmail_address'),
      getSetting(userId, 'gmail_app_password'),
      getSetting(userId, 'email_delay_min'),
      getSetting(userId, 'email_delay_max'),
    ]);
    res.json({
      gmail: {
        address: gmailAddress || '',
        appPasswordConfigured: !!gmailAppPassword,
        appPasswordMasked: mask(gmailAppPassword),
      },
      nvidia: {
        configured: !!nvidiaKey,
        maskedKey: mask(nvidiaKey),
      },
      emailDelay: {
        min: parseInt(delayMin, 10) || 30,
        max: parseInt(delayMax, 10) || 60,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — accepts any subset of gmail/nvidia/emailDelay
router.put('/', async (req, res) => {
  const { gmail, nvidia, emailDelay } = req.body || {};
  const userId = req.user.id;
  try {
    if (gmail?.address !== undefined) await setSetting(userId, 'gmail_address', String(gmail.address).trim());
    if (gmail?.appPassword)           await setSetting(userId, 'gmail_app_password', String(gmail.appPassword).trim());
    if (nvidia?.apiKey)               await setSetting(userId, 'nvidia_api_key', String(nvidia.apiKey).trim());
    if (emailDelay?.min !== undefined) await setSetting(userId, 'email_delay_min', String(parseInt(emailDelay.min, 10) || 30));
    if (emailDelay?.max !== undefined) await setSetting(userId, 'email_delay_max', String(parseInt(emailDelay.max, 10) || 60));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/test-email — verifies credentials before they're necessarily saved
router.post('/test-email', async (req, res) => {
  const { address, appPassword } = req.body || {};
  try {
    await sendTestEmail({ address, appPassword });
    res.json({ ok: true, message: `Test email sent to ${address}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = { router };
