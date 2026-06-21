const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db');
const {
  hashPassword, verifyPassword, createSession, deleteSession,
  isGoogleConfigured, getGoogleAuthUrl, verifyGoogleCode,
} = require('../services/authService');
const { requireAuth, SESSION_COOKIE } = require('../middleware/requireAuth');
const { authLimiter } = require('../middleware/rateLimiter');
const config = require('../config');

const OAUTH_STATE_COOKIE = 'oauth_state';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 128;
// Ties the cookie's Secure flag to whether the app is actually configured
// for HTTPS, rather than NODE_ENV=production — nothing in this project's
// Docker setup ever sets NODE_ENV, so that check would silently never
// activate even behind a real HTTPS reverse proxy.
const isHttps = config.publicBaseUrl.startsWith('https://');

function setSessionCookie(res, session) {
  res.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    expires: session.expiresAt,
  });
}

// New accounts (password or Google) get an empty profile row created
// immediately, so the rest of the app never has to handle "no profile
// row exists yet" as a special case.
async function createProfileRow(userId) {
  await pool.query('INSERT INTO candidate_profiles (user_id) VALUES ($1)', [userId]);
}

// The very first account ever created becomes admin automatically — the
// one piece of role-based access this app has, just enough to gate the
// backend console (see routes/logs.js). Zero manual configuration,
// consistent with the rest of this app's settings. Additional admins can
// be granted later with a direct UPDATE; there's no UI for it since a
// single admin is enough until a real roles system is built.
async function isFirstAccount() {
  const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
  return rows.length === 0;
}

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists.' });

    const makeAdmin = await isFirstAccount();
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, email, is_admin',
      [email, passwordHash, makeAdmin]
    );
    const user = rows[0];
    await createProfileRow(user.id);

    const session = await createSession(user.id);
    setSessionCookie(res, session);
    res.json({ id: user.id, email: user.email, isAdmin: user.is_admin });
  } catch (err) {
    next(err); // let the centralized error handler log it and respond generically
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const { rows } = await pool.query('SELECT id, email, password_hash, is_admin FROM users WHERE email=$1', [email]);
    const user = rows[0];
    // verifyPassword always runs a real bcrypt comparison, even when there's
    // no user or no password hash to check against (a Google-only account) —
    // otherwise the response time itself would leak which emails have an
    // account, since a real comparison takes measurably longer than the
    // short-circuit this would otherwise take.
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const session = await createSession(user.id);
    setSessionCookie(res, session);
    res.json({ id: user.id, email: user.email, isAdmin: user.is_admin });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (sessionId) await deleteSession(sessionId);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, isAdmin: req.user.isAdmin });
});

// GET /api/auth/google-enabled — lets the frontend hide the button when not configured
router.get('/google-enabled', (req, res) => {
  res.json({ enabled: isGoogleConfigured() });
});

// GET /api/auth/google — starts the OAuth redirect
router.get('/google', (req, res) => {
  if (!isGoogleConfigured()) return res.status(404).send('Google sign-in is not configured.');

  // A random per-attempt state value, checked again on callback, so a
  // third party can't trick a victim's browser into completing an OAuth
  // flow the victim didn't start (CSRF on the OAuth callback).
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: isHttps, maxAge: 10 * 60 * 1000 });
  res.redirect(getGoogleAuthUrl(state));
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE);
  if (!expectedState || req.query.state !== expectedState) {
    console.error('Google OAuth callback rejected: state mismatch');
    return res.redirect('/login.html?error=google_failed');
  }

  try {
    const { email, googleId } = await verifyGoogleCode(req.query.code);
    const { rows } = await pool.query(
      'SELECT id, email, google_id, is_admin FROM users WHERE google_id=$1 OR email=$2',
      [googleId, email.toLowerCase()]
    );
    let user = rows[0];

    if (!user) {
      const makeAdmin = await isFirstAccount();
      const ins = await pool.query(
        'INSERT INTO users (email, google_id, is_admin) VALUES ($1, $2, $3) RETURNING id, email, is_admin',
        [email.toLowerCase(), googleId, makeAdmin]
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
