const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { pool } = require('../db');
const { uploadLimiter } = require('../middleware/rateLimiter');

// ── POST /api/template-map/parse ─────────────────────────────────────────────
// Upload Excel → returns columns + all rows + 5-row preview
router.post('/parse', uploadLimiter, (req, res) => {
  const file = req.files?.excel;
  if (!file) return res.status(400).json({ error: 'No Excel file uploaded' });

  try {
    const wb = XLSX.read(file.data, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!raw.length) return res.status(400).json({ error: 'Excel file is empty' });

    const columns = Object.keys(raw[0]);
    const rows = raw.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) out[String(k).trim()] = String(v ?? '').trim();
      return out;
    });

    res.json({ columns, rows, total: rows.length, preview: rows.slice(0, 5) });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse Excel: ' + err.message });
  }
});

// ── POST /api/template-map/generate ──────────────────────────────────────────
// Body: { rows, subject, body, mapping: { Placeholder: ColumnName } }
router.post('/generate', (req, res) => {
  const { rows, subject, body, mapping } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows required' });
  if (!body?.trim()) return res.status(400).json({ error: 'body template required' });

  function fill(tpl, row) {
    let out = tpl;
    // Apply explicit mapping first
    if (mapping) {
      for (const [placeholder, col] of Object.entries(mapping)) {
        const val = row[col] ?? '';
        out = out.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'gi'), val);
      }
    }
    // Then fall back: replace any {{ColName}} directly from row
    for (const [col, val] of Object.entries(row)) {
      out = out.replace(new RegExp(`\\{\\{${col}\\}\\}`, 'gi'), val);
    }
    return out;
  }

  const emailCol   = mapping?.Email   || 'Email';
  const nameCol    = mapping?.Name    || 'Name';
  const companyCol = mapping?.Company || 'Company';

  const results = rows.map((row, i) => {
    const email   = (row[emailCol]   || '').trim();
    const name    = (row[nameCol]    || '').trim();
    const company = (row[companyCol] || '').trim();

    return {
      sno:     row.SNo || row.sno || (i + 1),
      email,
      name,
      company,
      subject: fill(subject || '', row),
      body:    fill(body, row),
      status:  email ? 'ready' : 'error',
      error:   email ? null : 'No email address in this row',
    };
  });

  console.log(`[template-map] Generated ${results.filter(r => r.status === 'ready').length}/${rows.length} emails`);
  res.json(results);
});

// ── GET /api/template-map/configs ────────────────────────────────────────────
router.get('/configs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mapping_configs ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/template-map/configs ───────────────────────────────────────────
router.post('/configs', async (req, res) => {
  const { name, subject, body, mapping } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Config name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO mapping_configs (name, subject, body, mapping) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), subject || '', body || '', JSON.stringify(mapping || {})]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/template-map/configs/:id ─────────────────────────────────────
router.delete('/configs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM mapping_configs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
