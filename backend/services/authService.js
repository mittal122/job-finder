const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../db');
const config = require('../config');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// A precomputed bcrypt hash of a random value, used only so verifyPassword
// always does real comparison work even when there's no real hash to check
// against. Without this, "no such user" / "Google-only account, no
// password" both short-circuit before bcrypt.compare ever runs, while a
// wrong password on a real account does run it — the timing difference
// leaks which emails have an account.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}

// Session IDs are unguessable random tokens looked up server-side — no
// signing secret needed, and revocation (logout) is a simple DELETE,
// unlike a stateless JWT.
async function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expiresAt]);
  return { id, expiresAt };
}

async function validateSession(sessionId) {
  if (!sessionId) return null;
  const { rows } = await pool.query(
    `SELECT s.user_id, u.email, u.is_admin FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );
  return rows[0] ? { id: rows[0].user_id, email: rows[0].email, isAdmin: rows[0].is_admin } : null;
}

async function deleteSession(sessionId) {
  await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

function isGoogleConfigured() {
  return !!config.googleClientId;
}

function getGoogleClient() {
  if (!isGoogleConfigured()) return null;
  return new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    `${config.publicBaseUrl}/api/auth/google/callback`
  );
}

function getGoogleAuthUrl(state) {
  const client = getGoogleClient();
  if (!client) return null;
  return client.generateAuthUrl({ scope: ['email', 'profile'], state });
}

async function verifyGoogleCode(code) {
  const client = getGoogleClient();
  if (!client) throw new Error('Google sign-in is not configured.');
  const { tokens } = await client.getToken(code);
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
  const payload = ticket.getPayload();
  return { email: payload.email, googleId: payload.sub };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  isGoogleConfigured,
  getGoogleAuthUrl,
  verifyGoogleCode,
};
