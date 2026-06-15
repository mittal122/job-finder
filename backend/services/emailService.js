const nodemailer = require('nodemailer');
const path = require('path');
const config = require('../config');

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: config.gmailAddress,
      pass: config.gmailAppPassword,
    },
  });
}

async function sendEmail({ to, subject, body, resumePath, resumeFilename }) {
  const transporter = createTransporter();

  // Strip markdown links for plain text version
  const plainText = stripMarkdown(body);

  const mailOptions = {
    from: `"${config.gmailSenderName || 'Mittal Domadiya'}" <${config.gmailAddress}>`,
    to,
    subject,
    text: plainText,
    html: bodyToHtml(body),
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

// Strips markdown link syntax: [text](url) → text
function stripMarkdown(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bodyToHtml(text) {
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

  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:580px;padding:0">${html}</div>`;
}

module.exports = { sendEmail };
