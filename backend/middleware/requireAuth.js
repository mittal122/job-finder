const { validateSession } = require('../services/authService');

const SESSION_COOKIE = 'session_id';

async function requireAuth(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  const user = await validateSession(sessionId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

module.exports = { requireAuth, SESSION_COOKIE };
