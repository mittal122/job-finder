require('dotenv').config();
require('./services/logger'); // must be first — patches console.*
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');

const config = require('./config');
const { initDb } = require('./db');

const profileRoutes   = require('./routes/profile');
const campaignRoutes  = require('./routes/campaigns');
const emailRoutes     = require('./routes/emails');
const uploadRoutes    = require('./routes/upload');
const { router: settingsRoutes } = require('./routes/settings');
const logsRoutes    = require('./routes/logs');
const bulkRoutes        = require('./routes/bulk');
const templateMapRoutes = require('./routes/template-map');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, useTempFiles: false }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/profile',   profileRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/emails',    emailRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/logs',      logsRoutes);
app.use('/api/bulk',         bulkRoutes);
app.use('/api/template-map', templateMapRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function start() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

start().catch(err => { console.error('Startup error:', err); process.exit(1); });
