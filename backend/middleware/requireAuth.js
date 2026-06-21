const { validateSession } = require('../services/authService');

const SESSION_COOKIE = 'session_id';

async function requireAuth(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  const user = await validateSession(sessionId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

// Must run after requireAuth (needs req.user already set). Kept separate
// rather than folded into requireAuth so routes that don't need admin
// access aren't affected.
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admins only.' });
  next();
}

module.exports = { requireAuth, requireAdmin, SESSION_COOKIE };
