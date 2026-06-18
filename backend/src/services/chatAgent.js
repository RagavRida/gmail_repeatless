/**
 * AI Chat Agent — Enhanced RAG pipeline.
 *
 * 4-step pipeline:
 * 1. Parse user's question for implicit filters (sender, date, category)
 * 2. Hybrid retrieval: vector search + full-text search + direct DB search
 * 3. Grounded generation: answer from context only, cite sources, no hallucination
 * 4. Store conversation, feed recent turns for follow-up resolution
 */
import { aiGenerate, aiEmbed } from '../ai/router.js';
import { PROMPTS } from '../ai/prompts/index.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

/**
 * Process a user message in a chat conversation.
 * @param {string} accountId
 * @param {string} conversationId
 * @param {string} userMessage
 * @returns {{ content: string, sources: Array, citations: Array }}
 */
export async function processMessage(accountId, conversationId, userMessage) {
  const db = getSupabase();

  // ── Input validation & sanitization ──
  if (!userMessage || typeof userMessage !== 'string') {
    return gracefulResponse(db, conversationId, 'Please type a message to get started!', userMessage);
  }

  // Trim and limit length (prevent prompt injection via massive inputs)
  const sanitized = userMessage.trim().substring(0, 2000);
  if (sanitized.length < 2) {
    return gracefulResponse(db, conversationId, 'Could you provide a bit more detail? I need at least a few words to search your emails.', sanitized);
  }

  // Save user message
  try {
    await db.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: sanitized,
    });
  } catch (dbErr) {
    logger.error(`[ChatAgent] Failed to save user message: ${dbErr.message}`);
    // Continue anyway — the response is more important than persisting the user message
  }

  let content, sources = [], uniqueCitations = [];

  try {
    // Detect if this is a newsletter/news digest query
    const isNewsQuery = detectNewsletterQuery(sanitized);

    if (isNewsQuery) {
      // Specialized newsletter intelligence pipeline
      logger.info(`[ChatAgent] Detected newsletter query, using digest pipeline`);
      const result = await newsletterDigestPipeline(accountId, sanitized);
      content = result.content;
      sources = result.sources || [];
      uniqueCitations = result.citations || [];
    } else {
      // Standard RAG pipeline
      // Step 1: Parse implicit filters from the question
      let filters;
      try {
        filters = await extractFilters(sanitized);
        logger.info(`[ChatAgent] Extracted filters:`, JSON.stringify(filters));
      } catch (filterErr) {
        logger.warn(`[ChatAgent] Filter extraction failed, using defaults: ${filterErr.message}`);
        filters = { sender: null, category: null, date_from: null, date_to: null, search_terms: sanitized, expanded_terms: null };
      }

      // Step 2: Hybrid retrieval — multiple strategies merged
      let contextBlocks = [];
      try {
        contextBlocks = await hybridRetrieval(accountId, sanitized, filters);
        logger.info(`[ChatAgent] Retrieved ${contextBlocks.length} context blocks`);
      } catch (retrievalErr) {
        logger.error(`[ChatAgent] Retrieval failed: ${retrievalErr.message}`);
        // Continue with empty context — the synthesis will handle it gracefully
      }

      // Step 3: Load recent conversation history for context
      let conversationHistory = [];
      try {
        conversationHistory = await getRecentHistory(conversationId, 6);
      } catch (histErr) {
        logger.warn(`[ChatAgent] Failed to load history: ${histErr.message}`);
      }

      // Step 4: Grounded generation with source attribution
      if (contextBlocks.length === 0) {
        // No relevant emails found — give a helpful response instead of hallucinating
        content = generateNoResultsResponse(sanitized, filters);
      } else {
        const prompt = PROMPTS.chatSynthesis(sanitized, contextBlocks, conversationHistory);
        content = await aiGenerate('generate', {
          prompt,
          opts: {
            systemInstruction: 'You are an AI email assistant. Answer questions exclusively from the user\'s emails. Always cite sources. Never hallucinate. If the provided emails don\'t contain the answer, say so clearly.',
            temperature: 0.3,
            maxTokens: 1500,
          },
        });
      }

      // Build sources/citations from retrieved context
      sources = contextBlocks.map((c) => ({
        message_id: c.id,
        thread_id: c.thread_id,
        subject: c.subject,
        from_address: c.from_address,
      }));

      const citations = contextBlocks.map((c) => ({
        sender: extractSenderName(c.from_address),
        senderEmail: extractEmail(c.from_address),
        subject: c.subject || '(no subject)',
        time: formatDate(c.internal_date),
      }));

      uniqueCitations = deduplicateCitations(citations);
    }
  } catch (pipelineErr) {
    // Catch-all: if ANYTHING in the pipeline crashes, return a graceful message
    logger.error(`[ChatAgent] Pipeline failed: ${pipelineErr.message}`);
    content = generateErrorResponse(pipelineErr);
  }

  // Save assistant response (don't crash if this fails)
  try {
    await db.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content,
      sources: JSON.stringify(sources),
    });
  } catch (saveErr) {
    logger.error(`[ChatAgent] Failed to save response: ${saveErr.message}`);
  }

  // Update conversation title if it's the first message
  try {
    const { data: conv } = await db.from('chat_conversations').select('title').eq('id', conversationId).single();
    if (!conv?.title || conv.title === 'New Investigation') {
      const title = sanitized.length > 50 ? sanitized.substring(0, 47) + '...' : sanitized;
      await db.from('chat_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversationId);
    }
  } catch (titleErr) {
    // Non-critical — don't crash over a title update
    logger.warn(`[ChatAgent] Failed to update title: ${titleErr.message}`);
  }

  return { content, sources, citations: uniqueCitations || [] };
}

/**
 * Return a graceful response for edge cases (empty input, etc.)
 */
async function gracefulResponse(db, conversationId, message, userMessage) {
  try {
    if (userMessage) {
      await db.from('chat_messages').insert({ conversation_id: conversationId, role: 'user', content: userMessage });
    }
    await db.from('chat_messages').insert({ conversation_id: conversationId, role: 'assistant', content: message });
  } catch (e) { /* ignore save errors for graceful fallbacks */ }
  return { content: message, sources: [], citations: [] };
}

/**
 * Generate a helpful "no results" message instead of empty/hallucinated response.
 */
function generateNoResultsResponse(query, filters) {
  const suggestions = [];

  if (filters?.search_terms) {
    suggestions.push(`• Try broader search terms — I searched for: "${filters.search_terms}"`);
  }
  if (filters?.category) {
    suggestions.push(`• I filtered to the "${filters.category}" category — try without the category filter`);
  }
  if (filters?.date_from) {
    suggestions.push(`• I searched within a specific date range — try asking without date restrictions`);
  }

  suggestions.push(
    '• Try rephrasing your question with different keywords',
    '• Ask about a specific sender or email subject you remember',
    '• If your emails were recently synced, some may still be processing'
  );

  return `I searched through your emails but couldn't find anything directly relevant to "${query}".\n\nHere are some suggestions:\n${suggestions.join('\n')}\n\nI can help with questions like:\n- "What did [person] email me about?"\n- "Find emails about [topic]"\n- "Summarize my recent newsletters"\n- "Any updates on [project]?"`;
}

/**
 * Generate a user-friendly error message based on the error type.
 */
function generateErrorResponse(error) {
  const msg = error?.message || '';

  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota')) {
    return '⏳ I\'m currently experiencing high demand on the AI service. The system is processing many emails in the background. Please try again in about 30 seconds — your request will be prioritized over background tasks.';
  }

  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return '⏱️ The request took too long to process. This can happen with complex queries. Could you try a simpler or more specific question?';
  }

  if (msg.includes('network') || msg.includes('ECONNREFUSED')) {
    return '🌐 I\'m having trouble connecting to the AI service. Please check your internet connection and try again.';
  }

  return `I encountered an issue processing your request. Here\'s what you can try:\n\n• **Wait a moment** — AI services may be temporarily busy\n• **Simplify your question** — shorter, more specific queries work best\n• **Try a different angle** — ask about a specific sender, subject, or date\n\nIf this keeps happening, the AI providers (Gemini/NIM) may be experiencing rate limits from background processing.`;
}

// ================================================================
// NEWSLETTER INTELLIGENCE PIPELINE
// ================================================================

/**
 * Detect if the user's question is about newsletters or news digests.
 */
function detectNewsletterQuery(message) {
  const lower = message.toLowerCase();
  const newsPatterns = [
    /\bnews\b/, /\bnewsletter/, /\bdigest\b/, /\bheadline/, /\btech.*news/,
    /\blatest.*news/, /\brecent.*news/, /\bimportant.*news/, /\btop.*stories/,
    /\bwhat.*happened/, /\bwhat's.*new/, /\bupdates.*from/, /\bnews.*items/,
    /\bnews.*past/, /\bnews.*last/, /\bnews.*week/, /\bnews.*days/,
    /\btrending/, /\bbreaking/, /\bannouncement/,
  ];
  return newsPatterns.some(p => p.test(lower));
}

/**
 * Specialized pipeline for newsletter queries:
 * 1. Fetch all newsletter emails from the relevant date range
 * 2. Extract news items from each newsletter using AI
 * 3. Deduplicate across sources by topic_key
 * 4. Synthesize a clean, organized response
 */
async function newsletterDigestPipeline(accountId, userMessage) {
  const db = getSupabase();

  // Parse date range from the query
  const dateRange = parseDateRange(userMessage);
  logger.info(`[NewsDigest] Date range: ${dateRange.from} to ${dateRange.to}`);

  // Fetch newsletter-category emails from the date range
  let query = db.from('messages')
    .select('id, thread_id, subject, from_address, internal_date, body_text, snippet, category')
    .eq('account_id', accountId)
    .gte('internal_date', dateRange.from)
    .lte('internal_date', dateRange.to)
    .order('internal_date', { ascending: false });

  // Filter to newsletter category if categorized, otherwise look for newsletter-like senders
  const { data: newsletters } = await query
    .in('category', ['newsletter', 'uncategorized'])
    .limit(30);

  if (!newsletters || newsletters.length === 0) {
    return {
      content: `I couldn't find any newsletter emails in your inbox from ${dateRange.from.split('T')[0]} to ${dateRange.to.split('T')[0]}. This could be because:\n\n• Your newsletters haven't been categorized yet (categorization is still running in the background)\n• You don't have newsletter subscriptions that sent emails in this period\n\nTry asking again in a few minutes, or ask about a different date range.`,
      sources: [],
      citations: [],
    };
  }

  // Filter to only likely newsletters (subject patterns, known newsletter senders)
  const likelyNewsletters = newsletters.filter(msg => {
    const sub = (msg.subject || '').toLowerCase();
    const from = (msg.from_address || '').toLowerCase();
    return (
      msg.category === 'newsletter' ||
      sub.includes('newsletter') || sub.includes('digest') || sub.includes('weekly') ||
      sub.includes('daily') || sub.includes('roundup') || sub.includes('edition') ||
      sub.includes('update') || sub.includes('briefing') || sub.includes('report') ||
      from.includes('newsletter') || from.includes('digest') || from.includes('substack') ||
      from.includes('beehiiv') || from.includes('morning') || from.includes('noreply') ||
      (msg.body_text && msg.body_text.length > 500) // Long emails are likely newsletters
    );
  });

  const toProcess = likelyNewsletters.length > 0 ? likelyNewsletters : newsletters;
  logger.info(`[NewsDigest] Found ${toProcess.length} newsletter emails to process`);

  // Extract news items from each newsletter (parallel with limit)
  const allNewsItems = [];
  const processBatch = toProcess.slice(0, 15); // Cap at 15 newsletters to avoid overload

  for (const msg of processBatch) {
    try {
      const date = msg.internal_date ? new Date(msg.internal_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const prompt = PROMPTS.newsletterDigestExtract(
        msg.subject || '',
        extractSenderName(msg.from_address),
        date,
        msg.body_text || msg.snippet || ''
      );

      const result = await aiGenerate('generate', {
        prompt,
        opts: { temperature: 0.1, maxTokens: 1000, responseMimeType: 'application/json' },
      });

      // Parse the JSON response
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const items = JSON.parse(cleaned);

      if (Array.isArray(items)) {
        items.forEach(item => {
          item.source_newsletter = extractSenderName(msg.from_address);
          item.source_email = extractEmail(msg.from_address);
          item.source_subject = msg.subject;
          item.source_date = date;
          item.message_id = msg.id;
          item.thread_id = msg.thread_id;
        });
        allNewsItems.push(...items);
      }

      logger.info(`[NewsDigest] Extracted ${items?.length || 0} items from "${msg.subject}"`);
    } catch (err) {
      logger.warn(`[NewsDigest] Failed to extract from "${msg.subject}": ${err.message}`);
    }
  }

  if (allNewsItems.length === 0) {
    return {
      content: `I found ${toProcess.length} newsletter emails from the past period, but couldn't extract any distinct news items from them. The newsletters may contain non-news content (promotions, personal updates, etc.).`,
      sources: toProcess.map(m => ({ message_id: m.id, thread_id: m.thread_id, subject: m.subject, from_address: m.from_address })),
      citations: deduplicateCitations(toProcess.map(m => ({
        sender: extractSenderName(m.from_address),
        senderEmail: extractEmail(m.from_address),
        subject: m.subject || '(no subject)',
        time: formatDate(m.internal_date),
      }))),
    };
  }

  // Deduplicate by topic_key
  const deduped = deduplicateNewsItems(allNewsItems);
  logger.info(`[NewsDigest] ${allNewsItems.length} total items → ${deduped.length} after dedup`);

  // Synthesize the final response
  const synthesisPrompt = PROMPTS.newsletterDigestSynthesize(deduped, userMessage);
  const content = await aiGenerate('generate', {
    prompt: synthesisPrompt,
    opts: {
      systemInstruction: 'You are an AI email assistant presenting a curated news digest from the user\'s newsletter emails. Be thorough, well-organized, and cite sources.',
      temperature: 0.3,
      maxTokens: 3000,
    },
  });

  // Build citations from processed newsletters
  const processedSources = processBatch.map(m => ({
    message_id: m.id,
    thread_id: m.thread_id,
    subject: m.subject,
    from_address: m.from_address,
  }));

  const processedCitations = deduplicateCitations(processBatch.map(m => ({
    sender: extractSenderName(m.from_address),
    senderEmail: extractEmail(m.from_address),
    subject: m.subject || '(no subject)',
    time: formatDate(m.internal_date),
  })));

  return { content, sources: processedSources, citations: processedCitations };
}

/**
 * Parse a date range from the user's message.
 * Handles "past 4 days", "last week", "past 2 weeks", etc.
 */
function parseDateRange(message) {
  const now = new Date();
  let daysBack = 7; // Default to 1 week

  const dayMatch = message.match(/(\d+)\s*day/i);
  const weekMatch = message.match(/(\d+)\s*week/i);
  const monthMatch = message.match(/(\d+)\s*month/i);

  if (dayMatch) daysBack = parseInt(dayMatch[1]);
  else if (weekMatch) daysBack = parseInt(weekMatch[1]) * 7;
  else if (monthMatch) daysBack = parseInt(monthMatch[1]) * 30;
  else if (/today/i.test(message)) daysBack = 1;
  else if (/yesterday/i.test(message)) daysBack = 2;
  else if (/this week/i.test(message)) daysBack = 7;
  else if (/last week/i.test(message)) daysBack = 14;

  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);

  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

/**
 * Deduplicate news items by topic_key, merging sources.
 */
function deduplicateNewsItems(items) {
  const byKey = new Map();

  for (const item of items) {
    const key = (item.topic_key || item.title || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!key) continue;

    if (byKey.has(key)) {
      const existing = byKey.get(key);
      // Merge sources
      if (!existing.all_sources) existing.all_sources = [existing.source_newsletter];
      if (!existing.all_sources.includes(item.source_newsletter)) {
        existing.all_sources.push(item.source_newsletter);
      }
      // Keep longer summary
      if ((item.summary || '').length > (existing.summary || '').length) {
        existing.summary = item.summary;
      }
    } else {
      byKey.set(key, { ...item, all_sources: [item.source_newsletter] });
    }
  }

  return [...byKey.values()];
}

// ================================================================
// STEP 1: Filter Extraction
// ================================================================

async function extractFilters(userQuestion) {
  try {
    const prompt = PROMPTS.chatFilterExtraction(userQuestion);
    const result = await aiGenerate('generate', {
      prompt,
      opts: { temperature: 0.0, maxTokens: 200, responseMimeType: 'application/json' },
    });

    // Parse JSON — handle potential markdown wrapping
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    logger.warn(`[ChatAgent] Failed to extract filters: ${error.message}`);
    return { sender: null, category: null, date_from: null, date_to: null, search_terms: null };
  }
}

// ================================================================
// STEP 2: Hybrid Retrieval (3 strategies merged)
// ================================================================

async function hybridRetrieval(accountId, userMessage, filters) {
  const db = getSupabase();
  const results = new Map(); // Deduplicate by message ID

  // Strategy 1: Vector search (if embeddings exist)
  try {
    const queryEmbedding = await aiEmbed(userMessage);

    const { data: vectorResults } = await db.rpc('match_messages', {
      query_embedding: queryEmbedding,
      match_account_id: accountId,
      match_count: 8,
      category_filter: filters.category || null,
      date_from: filters.date_from || null,
      date_to: filters.date_to || null,
    });

    if (vectorResults) {
      for (const r of vectorResults) {
        results.set(r.id, { ...r, retrieval_method: 'vector', score: r.similarity });
      }
      logger.info(`[ChatAgent] Vector search returned ${vectorResults.length} results`);
    }
  } catch (error) {
    logger.warn(`[ChatAgent] Vector search failed (OK — falling back to text): ${error.message}`);
  }

  // Strategy 2: Full-text search via tsvector
  try {
    const searchTerms = filters.search_terms || userMessage;
    const { data: ftsResults } = await db.rpc('search_messages_fts', {
      query_text: searchTerms,
      match_account_id: accountId,
      match_count: 8,
      category_filter: filters.category || null,
      date_from: filters.date_from || null,
      date_to: filters.date_to || null,
    });

    if (ftsResults) {
      for (const r of ftsResults) {
        if (!results.has(r.id)) {
          results.set(r.id, { ...r, retrieval_method: 'fts', score: r.rank });
        }
      }
      logger.info(`[ChatAgent] FTS returned ${ftsResults.length} results`);
    }
  } catch (error) {
    logger.warn(`[ChatAgent] FTS search failed (OK — falling back to direct): ${error.message}`);
  }

  // Strategy 3: Direct DB text search (ILIKE — works without embeddings or tsvector)
  // This is the robust fallback that always works
  // 3a: Search with primary keywords
  try {
    const primaryTerms = extractKeywords(filters.search_terms || userMessage);
    const expandedTerms = extractKeywords(filters.expanded_terms || '');
    const allTerms = [...new Set([...primaryTerms, ...expandedTerms])];

    if (allTerms.length > 0) {
      // Search in subject, snippet, from_address, AND body_text
      let query = db.from('messages')
        .select('id, thread_id, subject, snippet, from_address, internal_date, category, body_text')
        .eq('account_id', accountId);

      // Build OR filter: match any keyword in subject, snippet, from, or body
      const orConditions = allTerms.map(kw => {
        const safe = kw.replace(/[%_]/g, '');
        return `subject.ilike.%${safe}%,snippet.ilike.%${safe}%,from_address.ilike.%${safe}%`;
      }).join(',');

      query = query.or(orConditions);

      // Apply optional filters
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.date_from) query = query.gte('internal_date', filters.date_from);
      if (filters.date_to) query = query.lte('internal_date', filters.date_to);

      const { data: directResults } = await query
        .order('internal_date', { ascending: false })
        .limit(15);

      if (directResults) {
        for (const r of directResults) {
          if (!results.has(r.id)) {
            // Score higher if primary term matches, lower for expanded
            const matchesPrimary = primaryTerms.some(kw =>
              (r.subject || '').toLowerCase().includes(kw) ||
              (r.snippet || '').toLowerCase().includes(kw)
            );
            results.set(r.id, { ...r, retrieval_method: 'direct_search', score: matchesPrimary ? 0.6 : 0.35 });
          }
        }
        logger.info(`[ChatAgent] Direct search (subject/snippet) returned ${directResults.length} results for terms: [${allTerms.join(', ')}]`);
      }
    }
  } catch (error) {
    logger.warn(`[ChatAgent] Direct search failed: ${error.message}`);
  }

  // 3b: Deep body search — search body_text for expanded terms (catches emails 
  // where the relevant info is in the body, not the subject line)
  try {
    const bodyTerms = extractKeywords(filters.expanded_terms || filters.search_terms || userMessage);
    
    if (bodyTerms.length > 0 && results.size < 10) {
      // Pick top 3 most distinctive terms for body search to avoid overly broad queries
      const topTerms = bodyTerms.slice(0, 4);
      
      const bodyOrConditions = topTerms.map(kw => {
        const safe = kw.replace(/[%_]/g, '');
        return `body_text.ilike.%${safe}%`;
      }).join(',');

      const { data: bodyResults } = await db.from('messages')
        .select('id, thread_id, subject, snippet, from_address, internal_date, category, body_text')
        .eq('account_id', accountId)
        .or(bodyOrConditions)
        .order('internal_date', { ascending: false })
        .limit(10);

      if (bodyResults) {
        let added = 0;
        for (const r of bodyResults) {
          if (!results.has(r.id)) {
            results.set(r.id, { ...r, retrieval_method: 'body_search', score: 0.3 });
            added++;
          }
        }
        if (added > 0) {
          logger.info(`[ChatAgent] Body search added ${added} new results for terms: [${topTerms.join(', ')}]`);
        }
      }
    }
  } catch (error) {
    logger.warn(`[ChatAgent] Body search failed: ${error.message}`);
  }

  // Strategy 4: Sender-specific lookup
  if (filters.sender) {
    try {
      const { data: senderResults } = await db.from('messages')
        .select('id, thread_id, subject, snippet, from_address, internal_date, category, body_text')
        .eq('account_id', accountId)
        .ilike('from_address', `%${filters.sender}%`)
        .order('internal_date', { ascending: false })
        .limit(8);

      if (senderResults) {
        for (const r of senderResults) {
          if (!results.has(r.id)) {
            results.set(r.id, { ...r, retrieval_method: 'sender_filter', score: 0.5 });
          }
        }
        logger.info(`[ChatAgent] Sender search returned ${senderResults.length} results`);
      }
    } catch (error) {
      logger.warn(`[ChatAgent] Sender search failed: ${error.message}`);
    }
  }

  // Strategy 5: If still no results, fetch recent emails as general context
  if (results.size === 0) {
    try {
      const { data: recentResults } = await db.from('messages')
        .select('id, thread_id, subject, snippet, from_address, internal_date, category, body_text')
        .eq('account_id', accountId)
        .order('internal_date', { ascending: false })
        .limit(15);

      if (recentResults) {
        for (const r of recentResults) {
          results.set(r.id, { ...r, retrieval_method: 'recent_fallback', score: 0.2 });
        }
        logger.info(`[ChatAgent] Fallback: loaded ${recentResults.length} recent emails`);
      }
    } catch (error) {
      logger.warn(`[ChatAgent] Recent fallback failed: ${error.message}`);
    }
  }

  // Sort by score descending, limit to top results
  return [...results.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 15);
}

/**
 * Extract meaningful keywords from a user query.
 * Strips common stop words and short words.
 */
function extractKeywords(text) {
  if (!text) return [];
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'must', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about',
    'like', 'through', 'after', 'before', 'between', 'out', 'above',
    'below', 'up', 'down', 'and', 'but', 'or', 'nor', 'not', 'so',
    'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own',
    'same', 'than', 'too', 'very', 'just', 'because', 'during', 'while',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
    'how', 'when', 'where', 'why', 'me', 'my', 'i', 'you', 'your',
    'we', 'our', 'they', 'their', 'it', 'its', 'him', 'her', 'his',
    'email', 'emails', 'mail', 'mails', 'message', 'messages', 'tell',
    'show', 'find', 'give', 'get', 'got', 'know', 'think', 'want',
    'need', 'look', 'looking', 'please', 'thanks', 'thank',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s@.]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

// ================================================================
// STEP 3+4: Helpers
// ================================================================

async function getRecentHistory(conversationId, maxTurns) {
  const db = getSupabase();
  const { data: messages } = await db.from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(maxTurns);

  if (!messages || messages.length <= 1) return null; // Only current message

  return messages
    .reverse()
    .slice(0, -1) // Exclude the current user message (already in the prompt)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}

function extractSenderName(fromAddress) {
  if (!fromAddress) return 'Unknown';
  const match = fromAddress.match(/^(.+?)\s*</);
  return match ? match[1].replace(/"/g, '').trim() : fromAddress.split('@')[0];
}

function extractEmail(fromAddress) {
  if (!fromAddress) return '';
  const match = fromAddress.match(/<(.+?)>/);
  return match ? match[1] : fromAddress;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function deduplicateCitations(citations) {
  const seen = new Set();
  return citations.filter((c) => {
    const key = `${c.senderEmail}:${c.subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
