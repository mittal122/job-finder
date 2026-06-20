require('dotenv').config();
const os = require('os');
const path = require('path');

// Only genuinely infrastructure-level settings live here — things that
// must be known before the process can even start (which port to bind,
// how to reach the database) or that have a safe, automatic default no
// user should ever need to configure by hand. Business/user-facing
// settings (Gmail credentials, AI key, send delay) live in the
// app_settings DB table via services/settingsService.js instead, so
// they're configurable from the Settings page without editing files —
// see db.js's seedSettingIfEmpty() for how `.env` can still optionally
// pre-seed them on first boot.
module.exports = {
  port: parseInt(process.env.PORT || '8000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://jobfinder:jobfinder@localhost:5432/jobfinder',
  uploadDir: process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'jobfinder_uploads'),
};
