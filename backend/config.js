require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '8000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://jobfinder:jobfinder@localhost:5432/jobfinder',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  gmailAddress: process.env.GMAIL_ADDRESS || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
  uploadDir: process.env.UPLOAD_DIR || '/tmp/jobfinder_uploads',
  emailDelayMin: parseInt(process.env.EMAIL_DELAY_MIN || '30', 10),
  emailDelayMax: parseInt(process.env.EMAIL_DELAY_MAX || '60', 10),
};
