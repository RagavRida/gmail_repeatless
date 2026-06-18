/**
 * Prompt templates for all AI features.
 * Kept centralized for easy auditing and iteration.
 */

export const PROMPTS = {
  // ============================================================
  // SUMMARIZATION
  // ============================================================
  messageSummary: (subject, from, body) => `
Summarize the following email in 1-2 concise sentences. Focus on the key action items, decisions, or information conveyed. Do not add information not present in the email.

Subject: ${subject}
From: ${from}
Body:
${body}

Summary:`.trim(),

  threadSummary: (subject, messages) => `
Summarize the following email thread as a coherent narrative. Cover the key events, decisions, and current status. Mention specific senders when attributing actions or statements. Interpret each reply in the context of the full conversation.

Thread Subject: ${subject}
Messages (chronological order):
${messages.map((m, i) => `--- Message ${i + 1} ---\nFrom: ${m.from_address}\nDate: ${m.internal_date}\n${m.body_text || m.snippet || '[no content]'}`).join('\n\n')}

Thread Summary:`.trim(),

  // ============================================================
  // CATEGORIZATION
  // ============================================================
  categorize: (subject, from, snippet) => `
Classify this email into exactly ONE of these categories. Respond with ONLY the category name, nothing else.

Categories:
- newsletter (subscription-based content, digests, tech news)
- job_recruitment (job applications, offers, rejections, interview requests)
- finance (invoices, receipts, bank alerts, payments, billing)
- notifications (system alerts, OTPs, platform updates, deployment alerts)
- personal (direct human-to-human personal communication)
- work_professional (project discussions, team communication, work meetings)
- uncategorized (does not fit any above)

Email:
Subject: ${subject}
From: ${from}
Preview: ${snippet}

Category:`.trim(),

  // ============================================================
  // COMPOSE
  // ============================================================
  composeNew: (prompt, tone) => `
Draft a professional email based on the user's instructions below. Return ONLY the email content (no metadata headers like "Subject:" — those will be handled separately).

User's instructions: ${prompt}
Desired tone: ${tone || 'Professional'}

Write the email body:`.trim(),

  composeSubject: (prompt, body) => `
Generate a concise, professional email subject line for the following email. Return ONLY the subject line, nothing else.

User's intent: ${prompt}
Email body preview: ${body.substring(0, 200)}

Subject:`.trim(),

  // ============================================================
  // REPLY
  // ============================================================
  composeReply: (prompt, tone, threadMessages) => `
Draft a reply to the email thread below based on the user's instructions. The reply should be contextually appropriate given the full conversation history. Return ONLY the reply body.

Thread history (chronological):
${threadMessages.map((m, i) => `--- Message ${i + 1} ---\nFrom: ${m.from_address || m.sender}\nDate: ${m.internal_date || m.time}\n${m.body_text || m.body || m.snippet || '[no content]'}`).join('\n\n')}

User's instructions for the reply: ${prompt}
Desired tone: ${tone || 'Professional'}

Reply:`.trim(),

  // ============================================================
  // CHAT AGENT (RAG)
  // ============================================================
  chatFilterExtraction: (userQuestion) => `
Analyze the user's question about their emails and extract any implicit search filters. Return a JSON object with these fields (use null for any not mentioned):

{
  "sender": "sender name or email if mentioned, null otherwise",
  "category": "one of: newsletter, job_recruitment, finance, notifications, personal, work_professional — or null",
  "date_from": "ISO date string for start of date range, or null",
  "date_to": "ISO date string for end of date range, or null",
  "search_terms": "key search terms to look for, or null"
}

Today's date is ${new Date().toISOString().split('T')[0]}.

User's question: ${userQuestion}

JSON:`.trim(),

  chatSynthesis: (userQuestion, contextBlocks, conversationHistory) => `
You are an AI email assistant. Answer the user's question using ONLY the email context provided below. Follow these rules strictly:

1. ONLY use information from the provided email context blocks. Do NOT make up or infer information not present.
2. CITE your sources: for each fact, state which email/thread/sender it came from.
3. If multiple emails discuss the same topic, synthesize a coherent answer but attribute each piece to its source.
4. If the answer is NOT in the provided context, say so clearly — do NOT guess or hallucinate.
5. Be concise but thorough. Use bullet points for lists.

${conversationHistory ? `Recent conversation context:\n${conversationHistory}\n\n` : ''}

Email context blocks:
${contextBlocks.map((c, i) => `
[Source ${i + 1}]
Thread: ${c.subject}
From: ${c.from_address}
Date: ${c.internal_date}
Content: ${(c.body_text || c.snippet || '').substring(0, 1500)}
---`).join('\n')}

User's question: ${userQuestion}

Answer:`.trim(),

  // ============================================================
  // NEWSLETTER DEDUP
  // ============================================================
  newsletterExtract: (subject, from, body) => `
Extract distinct news items from this newsletter email. For each item, provide a JSON array with objects containing:
- "title": short headline
- "summary": 1-2 sentence summary
- "url": any URL mentioned for this item, or null

Return ONLY a valid JSON array. If there are no distinct news items, return [].

Newsletter:
Subject: ${subject}
From: ${from}
Body:
${(body || '').substring(0, 3000)}

JSON:`.trim(),
};
