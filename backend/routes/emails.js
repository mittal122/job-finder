const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const XLSX = require('xlsx');

// GET /api/emails?campaign_id=&status=&search=&page=&size=
router.get('/', async (req, res) => {
  const { campaign_id, status, search, page = 1, size = 20 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(size, 10);

  const conditions = [];
  const params = [];

  if (campaign_id) { params.push(campaign_id); conditions.push(`campaign_id = $${params.length}`); }
  if (status)      { params.push(status);      conditions.push(`status = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(company_name ILIKE $${params.length} OR email ILIKE $${params.length} OR hr_name ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM email_logs ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(size, 10), offset);
    const { rows } = await pool.query(
      `SELECT * FROM email_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ items: rows, total, page: parseInt(page, 10), size: parseInt(size, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/emails/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM email_logs WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Email log not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/emails/export/:campaign_id?format=csv|excel
router.get('/export/:campaign_id', async (req, res) => {
  const { format = 'csv' } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT hr_name, company_name, email, job_role, subject, status, error_message, sent_at, created_at
       FROM email_logs WHERE campaign_id=$1 ORDER BY created_at`,
      [req.params.campaign_id]
    );

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Emails');

    if (format === 'excel') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="campaign_${req.params.campaign_id}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }

    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Disposition', `attachment; filename="campaign_${req.params.campaign_id}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
