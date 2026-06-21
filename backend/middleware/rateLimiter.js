const rateLimit = require('express-rate-limit');

// Generous enough not to get in a real user's way during normal use
// (iterating on a template, retrying a failed campaign), tight enough to
// catch a runaway script/bug before it burns through Gmail's sending
// limits or the AI API budget. These key off IP rather than account,
// since login/signup attempts happen before a session exists at all,
// and per-account limiting elsewhere is a reasonable future refinement
// rather than something needed immediately at this scale.
function makeLimiter(windowMinutes, max, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

// Triggers a real send (email + AI calls): Campaign start, Bulk/Template Map send
const sendLimiter = makeLimiter(15, 30, 'Too many send requests — please wait a few minutes before trying again.');

// Cheaper but still real work: parsing/generating previews, uploading files
const uploadLimiter = makeLimiter(15, 60, 'Too many requests — please wait a few minutes before trying again.');

// Classic brute-force targets — much tighter than the others.
const authLimiter = makeLimiter(15, 10, 'Too many attempts — please wait a few minutes before trying again.');

module.exports = { sendLimiter, uploadLimiter, authLimiter };
