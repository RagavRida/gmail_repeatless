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

  // Save user message
  await db.from('chat_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: userMessage,
  });

  // Step 1: Parse implicit filters from the question
  const filters = await extractFilters(userMessage);
  logger.info(`[ChatAgent] Extracted filters:`, JSON.stringify(filters));

  // Step 2: Hybrid retrieval — multiple strategies merged
  const contextBlocks = await hybridRetrieval(accountId, userMessage, filters);
  logger.info(`[ChatAgent] Retrieved ${contextBlocks.length} context blocks`);

  // Step 3: Load recent conversation history for context
  const conversationHistory = await getRecentHistory(conversationId, 6);

  // Step 4: Grounded generation with source attribution
  const prompt = PROMPTS.chatSynthesis(userMessage, contextBlocks, conversationHistory);
  const content = await aiGenerate('generate', {
    prompt,
    opts: {
      systemInstruction: 'You are an AI email assistant. Answer questions exclusively from the user\'s emails. Always cite sources. Never hallucinate.',
      temperature: 0.3,
      maxTokens: 1500,
    },
  });

  // Build sources/citations from retrieved context
  const sources = contextBlocks.map((c) => ({
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

  const uniqueCitations = deduplicateCitations(citations);

  // Save assistant response with sources
  await db.from('chat_messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content,
    sources: JSON.stringify(sources),
  });

  // Update conversation title if it's the first message
  const { data: conv } = await db.from('chat_conversations').select('title').eq('id', conversationId).single();
  if (!conv?.title || conv.title === 'New Investigation') {
    const title = userMessage.length > 50 ? userMessage.substring(0, 47) + '...' : userMessage;
    await db.from('chat_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversationId);
  }

  return { content, sources, citations: uniqueCitations };
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
