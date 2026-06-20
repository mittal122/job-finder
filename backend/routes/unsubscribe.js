const express = require('express');
const router = express.Router();
const { suppress, verifyUnsubscribeToken } = require('../services/suppressionService');

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(title, message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escHtml(title)} — Job Finder</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:32px;max-width:420px;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#8b949e;margin:0}</style>
</head><body><div class="card"><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p></div></body></html>`;
}

// GET /api/unsubscribe?email=...&token=...
// Public, unauthenticated by design — opened directly from a link in an
// email. The signed token (tied to that specific email address) is what
// prevents anyone from suppressing an address that isn't theirs.
router.get('/', async (req, res) => {
  const { email, token } = req.query;
  if (!email || !(await verifyUnsubscribeToken(email, token))) {
    return res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or has expired.'));
  }
  await suppress(email, 'unsubscribed');
  res.send(page('You\'re unsubscribed', `${email} will not receive any further emails from this sender.`));
});

module.exports = router;
