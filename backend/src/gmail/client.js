/**
 * Create an authenticated Gmail API client for a given account.
 */
import { google } from 'googleapis';
import { getAuthenticatedClient } from '../auth/oauth.js';

/**
 * Returns an authenticated Gmail API client for the account.
 * @param {string} accountId - Account UUID
 * @returns {{ gmail: object, account: object }}
 */
export async function getGmailClient(accountId) {
  const { oauth2Client, account } = await getAuthenticatedClient(accountId);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return { gmail, account };
}
