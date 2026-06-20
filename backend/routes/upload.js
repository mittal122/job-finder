const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const { pool } = require('../db');
const { parseAndValidate } = require('../services/excelService');
const config = require('../config');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { isExcelBinary, isResumeFile } = require('../utils/fileSignature');

// Ensure upload dir exists
fs.mkdirSync(config.uploadDir, { recursive: true });

// POST /api/upload  — multipart form: excel file + optional resume + campaign name
router.post('/', uploadLimiter, async (req, res) => {
  try {
    if (!req.files || !req.files.excel) {
      return res.status(400).json({ error: 'No Excel file uploaded. Field name must be "excel".' });
    }

    const excelFile = req.files.excel;
    const campaignName = req.body.name || `Campaign ${new Date().toLocaleDateString()}`;
    const testMode = parseInt(req.body.test_mode || '0', 10);

    if (!isExcelBinary(excelFile.data)) {
      return res.status(400).json({ error: 'That file doesn\'t look like a valid Excel file (.xlsx/.xls). Check the file and try again.' });
    }

    // Validate Excel
    const validation = parseAndValidate(excelFile.data);

    if (!validation.valid_rows.length) {
      return res.status(422).json({ error: 'No valid rows found in Excel file.', validation });
    }

    // Save resume if provided
    let resumePath = null;
    if (req.files.resume) {
      const resumeFile = req.files.resume;
      if (!isResumeFile(resumeFile.data)) {
        return res.status(400).json({ error: 'That resume file doesn\'t look like a valid PDF/DOC/DOCX. Check the file and try again.' });
      }
      const ext = path.extname(resumeFile.name) || '.pdf';
      resumePath = path.join(config.uploadDir, `resume_${uuidv4()}${ext}`);
      await resumeFile.mv(resumePath);
    }

    // Create campaign
    const campaignId = uuidv4();
    await pool.query(
      `INSERT INTO campaigns (id, name, status, total_emails, pending_count, test_mode, resume_path)
       VALUES ($1, $2, 'PENDING', $3, $4, $5, $6)`,
      [campaignId, campaignName, validation.valid_rows.length, validation.valid_rows.length, testMode, resumePath]
    );

    // Insert email logs — one parameterized multi-row INSERT, no manual escaping
    const params = [];
    const placeholders = validation.valid_rows.map(row => {
      const base = params.length;
      params.push(uuidv4(), campaignId, row.hr_name || null, row.company_name, row.email, row.job_role || null, 'PENDING');
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    }).join(',');

    await pool.query(
      `INSERT INTO email_logs (id, campaign_id, hr_name, company_name, email, job_role, status) VALUES ${placeholders}`,
      params
    );

    res.json({
      campaign_id: campaignId,
      validation,
      message: `Campaign created with ${validation.valid_rows.length} valid recipients.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
