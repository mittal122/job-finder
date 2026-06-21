const crypto = require('crypto');
const { pool } = require('../db');

// unsubscribe_secret lives in the global app_config table (not per-user
// app_settings) — its job is to prevent forgery of a (userId, email)
// payload, so it doesn't need to differ per user, and a single secret
// avoids a chicken-and-egg problem for brand-new accounts with no
// settings configured yet.
async function getAppConfig(key) {
  const { rows } = await pool.query('SELECT value FROM app_config WHERE key=$1', [key]);
  return rows[0]?.value || '';
}

async function isSuppressed(userId, email) {
  const { rows } = await pool.query(
    'SELECT 1 FROM suppressions WHERE user_id = $1 AND email = $2',
    [userId, email.toLowerCase()]
  );
  return rows.length > 0;
}

async function suppress(userId, email, reason = 'unsubscribed') {
  await pool.query(
    `INSERT INTO suppressions (user_id, email, reason) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, email) DO NOTHING`,
    [userId, email.toLowerCase(), reason]
  );
}

async function generateUnsubscribeToken(userId, email) {
  const secret = await getAppConfig('unsubscribe_secret');
  return crypto.createHmac('sha256', secret).update(`${userId}:${email.toLowerCase()}`).digest('hex');
}

async function verifyUnsubscribeToken(userId, email, token) {
  if (!userId || !email || !token) return false;
  const expected = await generateUnsubscribeToken(userId, email);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { isSuppressed, suppress, generateUnsubscribeToken, verifyUnsubscribeToken };
