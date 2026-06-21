const { pool } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

async function getSetting(userId, key) {
  const { rows } = await pool.query(
    'SELECT value FROM app_settings WHERE user_id=$1 AND key=$2',
    [userId, key]
  );
  if (!rows.length || !rows[0].value) return '';
  return decrypt(rows[0].value);
}

async function setSetting(userId, key, value) {
  await pool.query(
    `INSERT INTO app_settings (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [userId, key, encrypt(value)]
  );
}

module.exports = { getSetting, setSetting };
