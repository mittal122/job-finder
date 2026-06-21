require('dotenv').config();
require('./services/logger'); // must be first — patches console.*
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const path = require('path');

const config = require('./config');
const { initDb } = require('./db');

const authRoutes        = require('./routes/auth');
const profileRoutes   = require('./routes/profile');
const campaignRoutes  = require('./routes/campaigns');
const emailRoutes     = require('./routes/emails');
const uploadRoutes    = require('./routes/upload');
const { router: settingsRoutes } = require('./routes/settings');
const logsRoutes    = require('./routes/logs');
const bulkRoutes        = require('./routes/bulk');
const templateMapRoutes = require('./routes/template-map');
const historyRoutes     = require('./routes/history');
const unsubscribeRoutes = require('./routes/unsubscribe');
const { apiNotFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/requireAuth');

const app = express();

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, useTempFiles: false }));

// Serve frontend static files (no auth check — pages load freely and
// redirect client-side to /login.html if their own API calls 401)
app.use(express.static(path.join(__dirname, '../frontend')));

// Public API routes — must be mounted before the requireAuth gate below
app.use('/api/auth',        authRoutes);
app.use('/api/unsubscribe', unsubscribeRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Everything else under /api requires a valid session
app.use('/api', requireAuth);

app.use('/api/profile',   profileRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/emails',    emailRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/logs',      logsRoutes);
app.use('/api/bulk',         bulkRoutes);
app.use('/api/template-map', templateMapRoutes);
app.use('/api/history',      historyRoutes);

// Unmatched /api/* paths get a JSON 404, not Express's default HTML page
app.use('/api', apiNotFound);

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Last-resort error handler — must be registered after all routes
app.use(errorHandler);

async function start() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

start().catch(err => { console.error('Startup error:', err); process.exit(1); });
