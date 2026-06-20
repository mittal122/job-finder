const crypto = require('crypto');
const { pool } = require('../db');
const { getSetting } = require('./settingsService');

async function isSuppressed(email) {
  const { rows } = await pool.query('SELECT 1 FROM suppressions WHERE email = $1', [email.toLowerCase()]);
  return rows.length > 0;
}

async function suppress(email, reason = 'unsubscribed') {
  await pool.query(
    `INSERT INTO suppressions (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase(), reason]
  );
}

async function generateUnsubscribeToken(email) {
  const secret = await getSetting('unsubscribe_secret');
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('hex');
}

async function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = await generateUnsubscribeToken(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { isSuppressed, suppress, generateUnsubscribeToken, verifyUnsubscribeToken };
