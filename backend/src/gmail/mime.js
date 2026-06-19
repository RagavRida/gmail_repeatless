/**
 * Build RFC 2822 MIME messages for sending and replying via Gmail API.
 * For replies, sets In-Reply-To and References headers so Gmail
 * threads them correctly.
 */

/**
 * Build a MIME message for a new email.
 * @param {{ to: string, subject: string, body: string, from?: string }} opts
 * @returns {string} base64url-encoded raw message
 */
export function buildNewMessage({ to, subject, body, from }) {
  const lines = [
    `From: ${from || 'me'}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ];
  return toBase64Url(lines.join('\r\n'));
}

/**
 * Build a MIME message for a reply.
 * Sets In-Reply-To and References headers for correct Gmail threading.
 * @param {{ to, subject, body, from?, messageIdHeader, referencesHeaders }} opts
 * @returns {string} base64url-encoded raw message
 */
export function buildReplyMessage({ to, subject, body, from, messageIdHeader, referencesHeaders, inReplyToHeader }) {
  // Normalize referencesHeaders — could be array, string, or null from DB
  let refsArray = [];
  if (Array.isArray(referencesHeaders)) {
    refsArray = referencesHeaders;
  } else if (typeof referencesHeaders === 'string' && referencesHeaders.trim()) {
    refsArray = referencesHeaders.split(/\s+/);
  }

  // The In-Reply-To header should reference the Message-ID of the message we're replying to
  const replyTo = messageIdHeader || inReplyToHeader || null;

  // Build References chain: original references + the message we're replying to
  const refs = [...refsArray];
  if (replyTo && !refs.includes(replyTo)) {
    refs.push(replyTo);
  }

  const lines = [
    `From: ${from || 'me'}`,
    `To: ${to}`,
    `Subject: ${subject.startsWith('Re:') ? subject : `Re: ${subject}`}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    ...(replyTo ? [`In-Reply-To: ${replyTo}`] : []),
    ...(refs.length > 0 ? [`References: ${refs.join(' ')}`] : []),
    '',
    body,
  ];
  return toBase64Url(lines.join('\r\n'));
}

/**
 * Convert string to base64url encoding (Gmail API requirement)
 */
function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
