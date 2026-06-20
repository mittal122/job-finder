const rateLimit = require('express-rate-limit');

// Generous enough not to get in a real user's way during normal use
// (iterating on a template, retrying a failed campaign), tight enough to
// catch a runaway script/bug before it burns through Gmail's sending
// limits or the AI API budget. Single-operator app, no auth yet — these
// key off IP, which is the best available signal until accounts exist.
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

module.exports = { sendLimiter, uploadLimiter };
