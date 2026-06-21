const { pool } = require('../db');

// Records one sent/failed email into the cross-section history table.
// Swallows its own errors so a logging failure never breaks the actual send flow.
async function recordHistory({ userId, source, sessionId, email, company, subject, body, status, errorMessage, resumeFilename, sentAt }) {
  try {
    await pool.query(
      `INSERT INTO send_history (user_id, source, session_id, email, company, subject, body, status, error_message, resume_filename, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [userId, source, sessionId || null, email, company || null, subject || null, body || null, status, errorMessage || null, resumeFilename || null, sentAt || null]
    );
  } catch (err) {
    console.error(`[history] Failed to record history for ${email}: ${err.message}`);
  }
}

module.exports = { recordHistory };
