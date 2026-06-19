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
You are a deterministic email classifier.

Valid categories:
job_recruitment
work_professional
notifications
newsletter
finance
personal
uncategorized

Definitions:
job_recruitment:
Hiring, interviews, recruiters, applications.

work_professional:
Projects, meetings, clients, team communication.

notifications:
OTP, alerts, account activity, security messages.

newsletter:
Marketing, digests, subscriptions, promotions.

finance:
Invoices, receipts, payments, billing.

personal:
Friends, family, personal conversations. Look for gmail, yahoo, outlook, casual tone.

uncategorized:
Anything unclear.

Rules:
- Return EXACTLY one category.
- Return ONLY the category.
- No explanations.
- No punctuation.
- If confidence < 70%, return uncategorized.
- Subject is most important.
- Sender domain is second most important.
- Snippet is third most important.

Priority Rules:
1. OTP/security emails → notifications
2. Interview/hiring emails → job_recruitment
3. Invoice/payment emails → finance
4. Promotions/digests → newsletter
5. Work-related discussions → work_professional
6. Personal conversations → personal
7. If email contains "unsubscribe", "view in browser", "digest", or "sponsored" → prefer newsletter

Examples:

Subject: Interview Invitation
From: recruiter@google.com
Category: job_recruitment

Subject: Your OTP Code
From: security@amazon.com
Category: notifications

Subject: Weekly AI Digest
From: newsletter@openai.com
Category: newsletter

Subject: AWS Invoice Available
From: billing@amazon.com
Category: finance

Subject: Cabin trip next month?
From: sarah@homemail.com
Category: personal

Classify:

Subject: ${subject}
From: ${from}
Snippet: ${snippet}

Category:`.trim(),

  // ============================================================
  // COMPOSE
  // ============================================================
  composeNew: (prompt, tone) => `
You are an expert business communication assistant.

Write an email using the user's instructions.

Rules:
- Return ONLY the email body.
- No subject line.
- Be concise and natural.
- Avoid AI-generated sounding phrases:
  - "I hope this email finds you well"
  - "I wanted to reach out"
  - "Please let me know if you have any questions"
  - "Please don't hesitate to contact me"
  - "I'm writing to inform you"
- Match the requested tone exactly.
- Include a clear purpose in the first sentence.
- Include a clear action or next step when appropriate.
- Do not include a sign-off or signature — the client appends it automatically.
- Do not repeat information unnecessarily.

IMPORTANT — Do not invent:
- dates
- phone numbers
- prices or amounts
- commitments or deadlines
- meeting times
- people or company names
If required information is missing, write the email without those details.

Style:
Tone: ${tone || 'Professional'}

User Instructions:
${prompt}

Email:`.trim(),

  composeSubject: (prompt, body) => `
Generate ONE email subject line.

Rules:
- Aim for 6-10 words.
- Prioritize specificity over brevity.
- Reflect the email's main purpose.
- No quotation marks.
- No prefixes like "Subject:" or "Re:".
- Avoid vague subjects such as:
  - "Follow Up"
  - "Checking In"
  - "Important Update"
  - "Quick Question"
  - "Regarding Our Discussion"

User intent:
${prompt}

Email preview:
${body.substring(0, 500)}

Subject:`.trim(),

  // ============================================================
  // REPLY
  // ============================================================
  composeReply: (prompt, tone, threadContext) => `
You are replying inside an existing email conversation.

Rules:
- Return ONLY the reply body.
- Use the thread context to inform your reply.
- Address unanswered questions from the latest message.
- Continue the conversation naturally.
- Do not repeat information already known in the thread.
- Do not summarize the thread.
- Keep the reply proportional to the message being answered.
- If the user requested specific points, prioritize them.
- Default to the user's configured tone below.
- Only adapt formality level (not mood) from the thread.
- Do not include a sign-off or signature — the client appends it automatically.
- Avoid AI clichés like "I hope this finds you well" or "Thank you for reaching out".

IMPORTANT — Do not invent:
- dates
- phone numbers
- prices or amounts
- commitments or deadlines
- meeting times
- people or company names
If required information is missing, write the reply without those details.

${threadContext}

User instructions for the reply:
${prompt}

Tone: ${tone || 'Professional'}

Reply:`.trim(),

  // ============================================================
  // CHAT AGENT (RAG)
  // ============================================================
  chatFilterExtraction: (userQuestion) => `
Analyze the user's question about their emails and extract search filters. Return a JSON object with these fields (use null for any not mentioned):

{
  "sender": "sender name or email if mentioned, null otherwise",
  "category": "one of: newsletter, job_recruitment, finance, notifications, personal, work_professional — or null",
  "date_from": "ISO date string for start of date range, or null",
  "date_to": "ISO date string for end of date range, or null",
  "search_terms": "key search terms from the question, space-separated",
  "expanded_terms": "additional related/synonym terms that emails about this topic might use. Think broadly about what words an email on this topic would contain. Space-separated. IMPORTANT: always include synonyms, related words, and alternative phrasings."
}

Examples of good expanded_terms:
- Question "any giveaway?" → search_terms: "giveaway selected", expanded_terms: "won winner congratulations prize contest raffle reward swag"
- Question "job applications" → search_terms: "job application", expanded_terms: "hiring interview recruiter position role offer resume career opportunity"
- Question "billing issues" → search_terms: "billing", expanded_terms: "invoice payment charge overdue subscription renewal amount due receipt"

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

  chatSynthesisThreaded: (userQuestion, threadContexts, conversationHistory) => `
You are an AI email assistant. Answer the user's question using ONLY the email threads provided below. Follow these rules strictly:

1. ONLY use information from the provided email threads. Do NOT make up or infer information not present.
2. Treat each thread as a CONVERSATION — understand the full exchange before answering.
3. CITE your sources: for each fact, state which thread subject and sender it came from.
4. If multiple threads discuss the same topic, synthesize a coherent answer across threads.
5. If a thread has a summary, use it for quick understanding but verify details from the messages.
6. If the answer is NOT in the provided context, say so clearly — do NOT guess or hallucinate.
7. Be concise but thorough. Use bullet points for lists.

${conversationHistory ? `Recent conversation context:\n${conversationHistory}\n\n` : ''}

Email threads:
${threadContexts.map((t, i) => `
═══ Thread ${i + 1}: "${t.subject}" (${t.messageCount} message${t.messageCount > 1 ? 's' : ''}) ═══
Category: ${t.category || 'uncategorized'}
${t.threadSummary ? `Thread Summary: ${t.threadSummary}\n` : ''}
${t.messages.map((m, j) => `  [${j + 1}] From: ${m.from}
  Date: ${m.date}
  ${m.content}
  ---`).join('\n')}
`).join('\n')}

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

  // ============================================================
  // NEWSLETTER DIGEST — Multi-source extraction + dedup
  // ============================================================
  newsletterDigestExtract: (subject, from, date, body) => `
Extract ALL distinct tech/industry news items from this newsletter email. For each item, return a JSON object:

{
  "title": "short headline (max 10 words)",
  "summary": "1-2 sentence summary of the news item",
  "topic_key": "lowercase-hyphenated-unique-key for dedup (e.g. openai-gpt5-release, apple-wwdc-recap)",
  "source_newsletter": "${from}",
  "source_date": "${date}"
}

Return ONLY a valid JSON array. If there are no distinct news items, return [].
Focus on: product launches, funding rounds, AI breakthroughs, company news, tech policy, open source releases.
Skip: ads, promotional content, job listings, event invitations.

Newsletter:
Subject: ${subject}
From: ${from}
Date: ${date}
Body:
${(body || '').substring(0, 4000)}

JSON:`.trim(),

  newsletterDigestSynthesize: (newsItems, userQuestion) => `
You are an AI email assistant. The user asked about news from their newsletter emails. Below is a deduplicated list of news items extracted from their newsletters.

Present these as a clean, well-organized response. Follow these rules:
1. Group by topic area (AI/ML, Startups, Big Tech, Open Source, etc.)
2. For each item, include the headline, a concise summary, and which newsletter(s) reported it
3. If multiple newsletters covered the same story, merge them and note all sources
4. Use bullet points and clear formatting
5. Highlight the most important/impactful stories first within each group
6. Include dates for each item

User's question: ${userQuestion}

News items (JSON):
${JSON.stringify(newsItems, null, 2)}

Organized response:`.trim(),
};
