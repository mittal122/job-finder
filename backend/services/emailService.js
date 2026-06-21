const nodemailer = require('nodemailer');
const path = require('path');
const { pool } = require('../db');
const { getSetting } = require('./settingsService');
const { generateUnsubscribeToken } = require('./suppressionService');
const config = require('../config');

async function getGmailCredentials(userId) {
  const [address, appPassword] = await Promise.all([
    getSetting(userId, 'gmail_address'),
    getSetting(userId, 'gmail_app_password'),
  ]);
  if (!address || !appPassword) {
    throw new Error('Gmail is not configured yet. Go to Settings to add your Gmail address and App Password.');
  }
  return { address, appPassword };
}

async function getSenderName(userId) {
  const { rows } = await pool.query('SELECT full_name FROM candidate_profiles WHERE user_id = $1', [userId]);
  return rows[0]?.full_name?.trim() || '';
}

function createTransporter(address, appPassword) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: address, pass: appPassword },
  });
}

async function buildUnsubscribeUrl(userId, to) {
  const token = await generateUnsubscribeToken(userId, to);
  return `${config.publicBaseUrl}/api/unsubscribe?user=${userId}&email=${encodeURIComponent(to)}&token=${token}`;
}

async function sendEmail({ userId, to, subject, body, resumePath, resumeFilename }) {
  const { address, appPassword } = await getGmailCredentials(userId);
  const senderName = await getSenderName(userId);
  const transporter = createTransporter(address, appPassword);
  const unsubscribeUrl = await buildUnsubscribeUrl(userId, to);

  // Strip markdown links for plain text version
  const plainText = `${stripMarkdown(body)}\n\n---\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}`;

  const mailOptions = {
    from: senderName ? `"${senderName}" <${address}>` : address,
    to,
    subject,
    text: plainText,
    html: bodyToHtml(body, unsubscribeUrl),
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
  };

  if (resumePath) {
    mailOptions.attachments = [{
      filename: resumeFilename || path.basename(resumePath),
      path: resumePath,
    }];
  }

  const info = await transporter.sendMail(mailOptions);
  return info.messageId;
}

// Sends a one-off test message to verify Gmail credentials work, using
// credentials passed in directly rather than whatever is already saved —
// lets the Settings page verify before persisting. No userId/unsubscribe
// link needed — this isn't a real campaign send.
async function sendTestEmail({ address, appPassword }) {
  if (!address || !appPassword) throw new Error('Gmail address and App Password are both required.');
  const transporter = createTransporter(address, appPassword);
  const info = await transporter.sendMail({
    from: address,
    to: address,
    subject: 'Job Finder — test email',
    text: 'This confirms your Gmail address and App Password are configured correctly. You can now send campaigns from Job Finder.',
  });
  return info.messageId;
}

// Strips markdown link syntax: [text](url) → text
function stripMarkdown(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bodyToHtml(text, unsubscribeUrl) {
  // Strip markdown links → convert to plain clickable links
  const cleaned = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#4a6cf7">$1</a>')
    .replace(/\[([^\]]+)\]\(mailto:([^)]+)\)/g,      '<a href="mailto:$2" style="color:#4a6cf7">$1</a>');

  // Split into paragraphs on double newline, join inner single newlines with <br>
  const paragraphs = cleaned.split(/\n{2,}/);
  const html = paragraphs
    .filter(p => p.trim())
    .map(para => {
      const lines = para.trim().split('\n').map(l => esc(l).trim()).filter(Boolean);
      return `<p style="margin:0 0 12px 0;padding:0;line-height:1.6">${lines.join('<br>')}</p>`;
    })
    .join('');

  const footer = unsubscribeUrl
    ? `<p style="margin:20px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;color:#999">Don't want these emails? <a href="${unsubscribeUrl}" style="color:#999">Unsubscribe</a></p>`
    : '';

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:580px;padding:0">${html}${footer}</div>`;
}

module.exports = { sendEmail, sendTestEmail };
