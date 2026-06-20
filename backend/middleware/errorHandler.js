// Centralized API error handling — two pieces:
//  - apiNotFound: any unmatched /api/* path gets a JSON 404 instead of
//    Express's default HTML error page (which breaks every frontend
//    call site, since api.js always does res.json() on the response).
//  - errorHandler: last-resort catch for anything a route didn't catch
//    itself. Logs the real error server-side, never leaks internals
//    to the client.

function apiNotFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
}

module.exports = { apiNotFound, errorHandler };
