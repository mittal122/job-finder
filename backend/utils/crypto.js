// AES-256-GCM encryption for secrets stored in app_settings (Gmail App
// Passwords, AI API keys). The key comes from config.encryptionKey,
// which lives outside the database by necessity — it cannot be
// auto-generated and stored in the thing it protects.
const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  // Accepts a hex string (e.g. from `openssl rand -hex 32`) of any
  // length and derives a stable 32-byte key via SHA-256, so the env var
  // doesn't have to be exactly 64 hex characters to be usable.
  return crypto.createHash('sha256').update(config.encryptionKey).digest();
}

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv:authTag:ciphertext, all hex — self-contained, no separate column needed
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(stored) {
  if (!stored) return stored;
  const parts = stored.split(':');
  if (parts.length !== 3) return stored; // not our format — leave as-is rather than throw
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
