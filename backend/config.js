require('dotenv').config();
const os = require('os');
const path = require('path');

// Only genuinely infrastructure-level settings live here — things that
// must be known before the process can even start (which port to bind,
// how to reach the database) or that have a safe, automatic default no
// user should ever need to configure by hand. Business/user-facing
// settings (Gmail credentials, AI key, send delay) live in the
// per-user app_settings DB table via services/settingsService.js
// instead, so each user configures their own from the Settings page
// without editing any file.
const port = parseInt(process.env.PORT || '8000', 10);

// The encryption key for secrets stored in app_settings (Gmail App
// Passwords, AI API keys) cannot itself be auto-generated and stored in
// the database it protects — a DB dump would then include both the
// ciphertext and the key. This is the one secret that's a genuine,
// unavoidable manual requirement. Fail fast and loudly rather than ever
// silently storing credentials unencrypted.
if (!process.env.ENCRYPTION_KEY) {
  console.error('FATAL: ENCRYPTION_KEY is not set.');
  console.error('Generate one with: openssl rand -hex 32');
  console.error('Then add it to your .env file as ENCRYPTION_KEY=<generated value>');
  process.exit(1);
}

module.exports = {
  port,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://jobfinder:jobfinder@localhost:5432/jobfinder',
  uploadDir: process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'jobfinder_uploads'),
  encryptionKey: process.env.ENCRYPTION_KEY,
  // Used to build absolute unsubscribe links in outgoing email, and as
  // the OAuth redirect base. Email sending happens in a background loop
  // with no request context to infer a host from, so this has to be
  // configured — defaults to localhost for local/Docker use; override
  // for any real deployment behind a real domain.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}`,
  // Google sign-in is optional infrastructure: if these aren't set, the
  // "Sign in with Google" button simply doesn't render and email+password
  // works standalone. Registering an OAuth app in Google Cloud Console is
  // unavoidable if you want this — there's no way around Google requiring it.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
};
