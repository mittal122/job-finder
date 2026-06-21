// Minimal migration runner — numbered .sql files in ./migrations, tracked
// in schema_migrations so each one applies exactly once across restarts.
// Introduced for the multi-tenant schema change: renaming existing tables
// and creating new ones is a one-way, sequenced operation that doesn't fit
// db.js's existing idempotent CREATE-TABLE-IF-NOT-EXISTS pattern.
const fs = require('fs');
const path = require('path');

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (rows.length) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`[migrate] Applying ${file}...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { runMigrations };
