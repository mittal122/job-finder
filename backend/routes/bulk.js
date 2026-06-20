const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { personalizeEmail, extractCompany, sleep } = require('../services/bulkAiService');
const { sendEmail } = require('../services/emailService');
const { recordHistory } = require('../services/historyService');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/jobfinder_uploads';

// In-memory sessions
const sessions = new Map();

function broadcast(session, payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of session.clients) {
    try { res.write(data); } catch { session.clients.delete(res); }
  }
}

// POST /api/bulk/generate — JSON body
router.post('/generate', async (req, res) => {
  const { emails, subject, template } = req.body;
  if (!Array.isArray(emails) || !emails.length) return res.status(400).json({ error: 'emails array required' });
  if (!template?.trim()) return res.status(400).json({ error: 'template required' });
  if (!subject?.trim())  return res.status(400).json({ error: 'subject required' });

  const results = [];
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i].trim();
    if (!email) continue;
    try {
      console.log(`[bulk] Generating ${i + 1}/${emails.length}: ${email}`);
      const generated = await personalizeEmail(template, subject, email);
      results.push({ email, company: generated.company, subject: generated.subject, body: generated.body, status: 'ready' });
    } catch (err) {
      console.error(`[bulk] Generation failed for ${email}: ${err.message}`);
      results.push({ email, company: extractCompany(email), subject, body: template, status: 'error', error: err.message });
    }
    if (i < emails.length - 1) await sleep(800);
  }
  console.log(`[bulk] Generation complete: ${results.filter(r => r.status === 'ready').length} ready, ${results.filter(r => r.status === 'error').length} failed`);
  res.json(results);
});

// POST /api/bulk/send — multipart/form-data
// Fields: items (JSON string), resume (optional file)
router.post('/send', async (req, res) => {
  let items;
  try {
    items = JSON.parse(req.body.items || '[]');
  } catch {
    return res.status(400).json({ error: 'Invalid items JSON' });
  }
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });

  // Save uploaded resume to disk if provided
  let resumePath = null;
  let resumeFilename = null;
  const resumeFile = req.files?.resume;
  if (resumeFile) {
    resumeFilename = resumeFile.name;                                    // preserve original name
    const ext = path.extname(resumeFile.name) || '.pdf';
    resumePath = path.join(UPLOAD_DIR, `resume_${Date.now()}${ext}`);  // temp path on disk only
    try {
      await resumeFile.mv(resumePath);
      console.log(`[bulk-send] Resume saved (${resumeFilename}): ${resumePath}`);
    } catch (err) {
      console.error(`[bulk-send] Resume save failed: ${err.message}`);
      resumePath = null;
      resumeFilename = null;
    }
  }

  // Send settings (passed as FormData string fields)
  const delaySeconds  = Math.max(1,  parseInt(req.body.delaySeconds  || '10', 10));
  const batchSize     = Math.max(1,  parseInt(req.body.batchSize     || '10', 10));
  const breakMinutes  = Math.max(0,  parseFloat(req.body.breakMinutes || '2'));
  const source        = req.body.source === 'template-map' ? 'template-map' : 'bulk';

  const sessionId = randomUUID();
  const session = {
    total: items.length,
    sent: 0,
    failed: 0,
    stopped: false,
    results: items.map(it => ({
      email: it.email,
      company: it.company || extractCompany(it.email),
      subject: it.subject,
      status: 'pending',
      error: null,
      sentAt: null,
    })),
    clients: new Set(),
    status: 'running',
  };
  sessions.set(sessionId, session);

  // Sleeps in 500ms chunks so stop requests are noticed quickly
  async function pauseable(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (session.stopped) return true;           // true = was interrupted
      await sleep(Math.min(500, end - Date.now()));
    }
    return false;
  }

  // Background sending
  (async () => {
    for (let i = 0; i < items.length; i++) {
      if (session.stopped) break;

      const it = items[i];
      const row = session.results[i];
      try {
        console.log(`[bulk-send] Sending ${i + 1}/${items.length} to ${it.email}`);
        await sendEmail({ to: it.email, subject: it.subject, body: it.body, resumePath, resumeFilename });
        row.status = 'sent';
        row.sentAt = new Date().toISOString();
        session.sent++;
        console.log(`[bulk-send] Sent to ${it.email}`);
        recordHistory({ source, sessionId, email: it.email, company: row.company, subject: it.subject, body: it.body, status: 'SENT', resumeFilename, sentAt: row.sentAt });
      } catch (err) {
        row.status = 'failed';
        row.error = err.message;
        session.failed++;
        console.error(`[bulk-send] Failed ${it.email}: ${err.message}`);
        recordHistory({ source, sessionId, email: it.email, company: row.company, subject: it.subject, body: it.body, status: 'FAILED', errorMessage: err.message, resumeFilename });
      }
      broadcast(session, { type: 'update', index: i, row, sent: session.sent, failed: session.failed, total: session.total });

      if (i < items.length - 1) {
        const isEndOfBatch = (i + 1) % batchSize === 0;
        if (isEndOfBatch && breakMinutes > 0) {
          const breakMs = Math.round(breakMinutes * 60 * 1000);
          const breakUntil = new Date(Date.now() + breakMs).toISOString();
          const batchNum = Math.floor((i + 1) / batchSize);
          console.log(`[bulk-send] Batch ${batchNum} done — pausing ${breakMinutes}m`);
          broadcast(session, { type: 'break', batchNum, breakMs, breakUntil, sent: session.sent, failed: session.failed, total: session.total });
          const interrupted = await pauseable(breakMs);
          if (interrupted) break;
          broadcast(session, { type: 'break-done' });
        } else {
          const interrupted = await pauseable(delaySeconds * 1000);
          if (interrupted) break;
        }
      }
    }

    session.status = session.stopped ? 'stopped' : 'done';
    const eventType = session.stopped ? 'stopped' : 'done';
    broadcast(session, { type: eventType, sent: session.sent, failed: session.failed, total: session.total });
    console.log(`[bulk-send] ${session.status} — sent: ${session.sent}, failed: ${session.failed}`);

    if (resumePath) fs.unlink(resumePath, () => {});
    setTimeout(() => sessions.delete(sessionId), 3600000);
  })();

  res.json({ sessionId });
});

// POST /api/bulk/stop/:sessionId — stop a running session
router.post('/stop/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'running') return res.json({ ok: true, status: session.status });
  session.stopped = true;
  console.log(`[bulk-send] Stop requested for session ${req.params.sessionId}`);
  res.json({ ok: true });
});

// GET /api/bulk/progress/:sessionId — SSE
router.get('/progress/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'init', results: session.results, sent: session.sent, failed: session.failed, total: session.total, status: session.status })}\n\n`);

  if (session.status === 'done' || session.status === 'stopped') { res.end(); return; }

  session.clients.add(res);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { clearInterval(hb); } }, 15000);
  req.on('close', () => { clearInterval(hb); session.clients.delete(res); });
});

module.exports = router;
