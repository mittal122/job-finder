const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { processCampaign, retryFailed } = require('../services/campaignProcessor');
const { sendLimiter } = require('../middleware/rateLimiter');

// GET /api/campaigns — list all with stats, for the current user only
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM campaigns WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/stats — dashboard stats for the current user only
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                                              AS total_campaigns,
        COALESCE(SUM(total_emails),0)::int                        AS total_emails,
        COALESCE(SUM(sent_count),0)::int                          AS total_sent,
        COALESCE(SUM(failed_count),0)::int                        AS total_failed,
        COALESCE(SUM(pending_count),0)::int                       AS total_pending
      FROM campaigns WHERE user_id=$1
    `, [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM campaigns WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/start — launch processing (async, fire-and-forget)
router.post('/:id/start', sendLimiter, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const { rows } = await pool.query('SELECT status FROM campaigns WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
    if (rows[0].status === 'PROCESSING') return res.status(409).json({ error: 'Campaign already running' });

    // Start processing in background (non-blocking)
    processCampaign(userId, id).catch(err => {
      console.error(`Campaign ${id} processor error:`, err);
      pool.query(`UPDATE campaigns SET status='FAILED', updated_at=NOW() WHERE id=$1 AND user_id=$2`, [id, userId]);
    });

    res.json({ message: 'Campaign started', campaign_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/retry — retry failed emails
router.post('/:id/retry', sendLimiter, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { email_ids } = req.body || {};
  try {
    await retryFailed(userId, id, email_ids || null);

    // Restart processing
    processCampaign(userId, id).catch(err => {
      console.error(`Campaign ${id} retry error:`, err);
    });

    res.json({ message: 'Retry started', campaign_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM campaigns WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
