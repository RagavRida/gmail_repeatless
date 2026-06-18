/**
 * AES-256-GCM encryption/decryption for OAuth tokens.
 * Tokens are encrypted before storage in Supabase — never stored in plaintext.
 * Uses a server-only TOKEN_ENCRYPTION_KEY.
 */
import crypto from 'crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const hex = config.tokenEncryptionKey;
  if (!hex || hex.length < 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be at least 32 hex characters (16 bytes)');
  }
  // Accept hex-encoded keys (64 chars = 32 bytes) or raw strings
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === 64) {
    return Buffer.from(hex, 'hex');
  }
  // Hash arbitrary-length string keys to 32 bytes
  return crypto.createHash('sha256').update(hex).digest();
}

/**
 * Encrypt plaintext token → base64 string (iv:authTag:ciphertext)
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt base64 string → plaintext token
 */
export function decrypt(encryptedStr) {
  if (!encryptedStr) return null;
  const key = getKey();
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
