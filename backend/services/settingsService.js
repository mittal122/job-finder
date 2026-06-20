const { pool } = require('../db');

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [key]);
  return rows[0]?.value || '';
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

module.exports = { getSetting, setSetting };
