/**
 * Google OAuth2 flow: authorization URL generation, callback handling,
 * token storage, and token refresh.
 */
import { google } from 'googleapis';
import { config } from '../config/index.js';
import { encrypt, decrypt } from './crypto.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

/**
 * Create a fresh OAuth2 client instance
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Generate the Google consent screen URL
 */
export function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: config.google.scopes,
  });
}

/**
 * Exchange authorization code for tokens, store account in DB
 * Returns the account record
 */
export async function handleCallback(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get user email from Google
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();
  const email = userInfo.email;

  logger.info(`OAuth callback for: ${email}`);

  // Encrypt tokens before storage
  const accessTokenEncrypted = encrypt(tokens.access_token);
  const refreshTokenEncrypted = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

  const db = getSupabase();

  // Upsert account — update tokens if account already exists
  const { data: account, error } = await db
    .from('accounts')
    .upsert(
      {
        google_email: email,
        access_token_encrypted: accessTokenEncrypted,
        ...(refreshTokenEncrypted && { refresh_token_encrypted: refreshTokenEncrypted }),
        token_expiry: tokenExpiry,
      },
      { onConflict: 'google_email' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to upsert account:', error);
    throw new Error(`Failed to store account: ${error.message}`);
  }

  return account;
}

/**
 * Get an authenticated OAuth2 client for an account.
 * Handles token refresh automatically.
 */
export async function getAuthenticatedClient(accountId) {
  const db = getSupabase();
  const { data: account, error } = await db
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    throw new Error('Account not found');
  }

  const oauth2Client = createOAuth2Client();

  const accessToken = decrypt(account.access_token_encrypted);
  const refreshToken = decrypt(account.refresh_token_encrypted);

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.token_expiry ? new Date(account.token_expiry).getTime() : null,
  });

  // Listen for token refresh events and update DB
  oauth2Client.on('tokens', async (newTokens) => {
    logger.info(`Token refreshed for account: ${account.google_email}`);
    const updates = {};
    if (newTokens.access_token) {
      updates.access_token_encrypted = encrypt(newTokens.access_token);
    }
    if (newTokens.refresh_token) {
      updates.refresh_token_encrypted = encrypt(newTokens.refresh_token);
    }
    if (newTokens.expiry_date) {
      updates.token_expiry = new Date(newTokens.expiry_date).toISOString();
    }
    await db.from('accounts').update(updates).eq('id', accountId);
  });

  return { oauth2Client, account };
}
