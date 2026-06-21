const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/history?source=&status=&search=&page=&size=
router.get('/', async (req, res) => {
  const { source, status, search, page = 1, size = 25 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(size, 10);

  const conditions = ['user_id = $1'];
  const params = [req.user.id];

  if (source) { params.push(source); conditions.push(`source = $${params.length}`); }
  if (status) { params.push(status.toUpperCase()); conditions.push(`status = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(email ILIKE $${params.length} OR company ILIKE $${params.length} OR subject ILIKE $${params.length})`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM send_history ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(Math.min(parseInt(size, 10), 200), offset);
    const { rows } = await pool.query(
      `SELECT * FROM send_history ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ items: rows, total, page: parseInt(page, 10), size: parseInt(size, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/stats — totals overall and per-source, for the current user only
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                                       AS total,
        COUNT(*) FILTER (WHERE status='SENT')::int          AS total_sent,
        COUNT(*) FILTER (WHERE status='FAILED')::int        AS total_failed,
        COUNT(*) FILTER (WHERE source='bulk')::int          AS total_bulk,
        COUNT(*) FILTER (WHERE source='template-map')::int  AS total_template_map,
        COUNT(*) FILTER (WHERE source='campaign')::int      AS total_campaign
      FROM send_history WHERE user_id=$1
    `, [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/history/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM send_history WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
