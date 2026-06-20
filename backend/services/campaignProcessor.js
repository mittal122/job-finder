const path = require('path');
const { pool } = require('../db');
const { generateEmail } = require('./aiService');
const { sendEmail } = require('./emailService');
const { recordHistory } = require('./historyService');
const { getSetting } = require('./settingsService');
const { isSuppressed } = require('./suppressionService');

function randomDelay(min, max) {
  const ms = (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
  return new Promise(r => setTimeout(r, ms));
}

async function getProfile() {
  const { rows } = await pool.query('SELECT * FROM candidate_profiles WHERE id = 1');
  return rows[0] || { full_name: '', skills: [], projects: [], experience_years: 0, bio: '' };
}

async function getEmailDelayRange() {
  const [min, max] = await Promise.all([
    getSetting('email_delay_min'),
    getSetting('email_delay_max'),
  ]);
  return { min: parseInt(min, 10) || 30, max: parseInt(max, 10) || 60 };
}

async function updateCampaignCounts(campaignId) {
  await pool.query(`
    UPDATE campaigns SET
      sent_count    = (SELECT COUNT(*) FROM email_logs WHERE campaign_id = $1 AND status = 'SENT'),
      failed_count  = (SELECT COUNT(*) FROM email_logs WHERE campaign_id = $1 AND status = 'FAILED'),
      pending_count = (SELECT COUNT(*) FROM email_logs WHERE campaign_id = $1 AND status IN ('PENDING','GENERATED')),
      updated_at    = NOW()
    WHERE id = $1
  `, [campaignId]);
}

async function processCampaign(campaignId) {
  await pool.query(`UPDATE campaigns SET status='PROCESSING', updated_at=NOW() WHERE id=$1`, [campaignId]);

  const campaign = await pool.query('SELECT * FROM campaigns WHERE id=$1', [campaignId]);
  const { test_mode, resume_path } = campaign.rows[0];

  const { rows: emailRows } = await pool.query(
    `SELECT * FROM email_logs WHERE campaign_id=$1 AND status='PENDING' ORDER BY created_at`,
    [campaignId]
  );

  const limit = test_mode > 0 ? test_mode : emailRows.length;
  const batch = emailRows.slice(0, limit);
  const profile = await getProfile();
  const emailDelay = await getEmailDelayRange();

  for (let i = 0; i < batch.length; i++) {
    const logEntry = batch[i];

    if (await isSuppressed(logEntry.email)) {
      await pool.query(
        `UPDATE email_logs SET status='FAILED', error_message=$1, updated_at=NOW() WHERE id=$2`,
        ['Recipient has unsubscribed — skipped', logEntry.id]
      );
      recordHistory({ source: 'campaign', sessionId: campaignId, email: logEntry.email, company: logEntry.company_name, status: 'FAILED', errorMessage: 'Recipient has unsubscribed — skipped' });
      await updateCampaignCounts(campaignId);
      continue;
    }

    // Step 1: Generate email
    let subject, body;
    try {
      const generated = await generateEmail(profile, logEntry);
      subject = generated.subject;
      body = generated.body;

      await pool.query(
        `UPDATE email_logs SET status='GENERATED', subject=$1, body=$2, updated_at=NOW() WHERE id=$3`,
        [subject, body, logEntry.id]
      );
    } catch (err) {
      await pool.query(
        `UPDATE email_logs SET status='FAILED', error_message=$1, updated_at=NOW() WHERE id=$2`,
        [`AI generation failed: ${err.message}`, logEntry.id]
      );
      recordHistory({ source: 'campaign', sessionId: campaignId, email: logEntry.email, company: logEntry.company_name, status: 'FAILED', errorMessage: `AI generation failed: ${err.message}` });
      await updateCampaignCounts(campaignId);
      continue;
    }

    // Step 2: Send email
    try {
      await sendEmail({ to: logEntry.email, subject, body, resumePath: resume_path });

      const sentAt = new Date();
      await pool.query(
        `UPDATE email_logs SET status='SENT', sent_at=$1, updated_at=NOW() WHERE id=$2`,
        [sentAt, logEntry.id]
      );
      recordHistory({ source: 'campaign', sessionId: campaignId, email: logEntry.email, company: logEntry.company_name, subject, body, status: 'SENT', resumeFilename: resume_path ? path.basename(resume_path) : null, sentAt });
    } catch (err) {
      await pool.query(
        `UPDATE email_logs SET status='FAILED', error_message=$1, updated_at=NOW() WHERE id=$2`,
        [`Send failed: ${err.message}`, logEntry.id]
      );
      recordHistory({ source: 'campaign', sessionId: campaignId, email: logEntry.email, company: logEntry.company_name, subject, body, status: 'FAILED', errorMessage: `Send failed: ${err.message}` });
    }

    await updateCampaignCounts(campaignId);

    // Rate limiting delay (skip after last email)
    if (i < batch.length - 1) {
      await randomDelay(emailDelay.min, emailDelay.max);
    }
  }

  // Final status
  const final = await pool.query(
    `SELECT failed_count, pending_count FROM campaigns WHERE id=$1`,
    [campaignId]
  );
  const { failed_count, pending_count } = final.rows[0];
  const finalStatus = pending_count === 0 && failed_count === 0 ? 'COMPLETED'
    : pending_count === 0 ? 'COMPLETED'
    : 'PAUSED';

  await pool.query(`UPDATE campaigns SET status=$1, updated_at=NOW() WHERE id=$2`, [finalStatus, campaignId]);
}

async function retryFailed(campaignId, emailIds) {
  let query, params;
  if (emailIds && emailIds.length) {
    query = `UPDATE email_logs SET status='PENDING', retry_count=retry_count+1, error_message=NULL, updated_at=NOW()
             WHERE campaign_id=$1 AND id=ANY($2) AND status='FAILED'`;
    params = [campaignId, emailIds];
  } else {
    query = `UPDATE email_logs SET status='PENDING', retry_count=retry_count+1, error_message=NULL, updated_at=NOW()
             WHERE campaign_id=$1 AND status='FAILED'`;
    params = [campaignId];
  }
  await pool.query(query, params);
  await pool.query(
    `UPDATE campaigns SET pending_count=(SELECT COUNT(*) FROM email_logs WHERE campaign_id=$1 AND status='PENDING'),
     failed_count=(SELECT COUNT(*) FROM email_logs WHERE campaign_id=$1 AND status='FAILED'), updated_at=NOW() WHERE id=$1`,
    [campaignId]
  );
}

module.exports = { processCampaign, retryFailed };
