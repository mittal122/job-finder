const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const {
  hashPassword, verifyPassword, createSession, deleteSession,
  isGoogleConfigured, getGoogleAuthUrl, verifyGoogleCode,
} = require('../services/authService');
const { requireAuth, SESSION_COOKIE } = require('../middleware/requireAuth');
const { authLimiter } = require('../middleware/rateLimiter');

const isProd = process.env.NODE_ENV === 'production';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setSessionCookie(res, session) {
  res.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    expires: session.expiresAt,
  });
}

// New accounts (password or Google) get an empty profile row created
// immediately, so the rest of the app never has to handle "no profile
// row exists yet" as a special case.
async function createProfileRow(userId) {
  await pool.query('INSERT INTO candidate_profiles (user_id) VALUES ($1)', [userId]);
}

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists.' });

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );
    const user = rows[0];
    await createProfileRow(user.id);

    const session = await createSession(user.id);
    setSessionCookie(res, session);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const session = await createSession(user.id);
    setSessionCookie(res, session);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) await deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// GET /api/auth/google-enabled — lets the frontend hide the button when not configured
router.get('/google-enabled', (req, res) => {
  res.json({ enabled: isGoogleConfigured() });
});

// GET /api/auth/google — starts the OAuth redirect
router.get('/google', (req, res) => {
  const url = getGoogleAuthUrl();
  if (!url) return res.status(404).send('Google sign-in is not configured.');
  res.redirect(url);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { email, googleId } = await verifyGoogleCode(req.query.code);
    const { rows } = await pool.query(
      'SELECT id, email, google_id FROM users WHERE google_id=$1 OR email=$2',
      [googleId, email.toLowerCase()]
    );
    let user = rows[0];

    if (!user) {
      const ins = await pool.query(
        'INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id, email',
        [email.toLowerCase(), googleId]
      );
      user = ins.rows[0];
      await createProfileRow(user.id);
    } else if (!user.google_id) {
      // Existing password-based account signing in with Google for the first time — link it.
      await pool.query('UPDATE users SET google_id=$1 WHERE id=$2', [googleId, user.id]);
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session);
    res.redirect('/');
  } catch (err) {
    console.error('Google OAuth callback failed:', err.message);
    res.redirect('/login.html?error=google_failed');
  }
});

module.exports = router;
