/**
 * Newsletter Deduplication service.
 * For messages categorized as 'newsletter':
 * 1. Extract {title, summary, url} items using Gemini structured output
 * 2. Embed each item's title+summary
 * 3. Cluster by cosine similarity (threshold > 0.85) — greedy pairwise
 * 4. Store cluster_id on duplicates
 * 5. Present digest with clusters collapsed to one item + all source_names
 */
import { aiGenerate, aiEmbed } from '../ai/router.js';
import { PROMPTS } from '../ai/prompts/index.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';
import crypto from 'crypto';

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Process newsletter messages for an account: extract items, embed, cluster.
 */
export async function processNewsletters(accountId) {
  const db = getSupabase();

  // Find newsletter messages that haven't been processed yet
  const { data: newsletterMsgs } = await db.from('messages')
    .select('id, from_address, subject, body_text, internal_date')
    .eq('account_id', accountId)
    .eq('category', 'newsletter')
    .order('internal_date', { ascending: false })
    .limit(30);

  if (!newsletterMsgs || newsletterMsgs.length === 0) return [];

  // Check which messages already have extracted items
  const { data: existingItems } = await db.from('news_items')
    .select('source_message_id')
    .eq('account_id', accountId);

  const processedIds = new Set((existingItems || []).map((i) => i.source_message_id));

  let newItems = [];

  for (const msg of newsletterMsgs) {
    if (processedIds.has(msg.id)) continue;

    try {
      const items = await extractNewsItems(msg);
      const sourceName = extractSourceName(msg.from_address);

      for (const item of items) {
        // Embed the item for clustering
        const embeddingText = `${item.title} ${item.summary}`;
        const embedding = await aiEmbed(embeddingText);

        const { data: inserted } = await db.from('news_items').insert({
          account_id: accountId,
          source_message_id: msg.id,
          source_name: sourceName,
          title: item.title,
          summary: item.summary,
          url: item.url || null,
          published_at: msg.internal_date,
          embedding,
        }).select().single();

        if (inserted) newItems.push(inserted);
      }
    } catch (err) {
      logger.error(`Failed to extract news from message ${msg.id}: ${err.message}`);
    }
  }

  // Run clustering on all items
  if (newItems.length > 0) {
    await clusterNewsItems(accountId);
  }

  logger.info(`Processed ${newItems.length} new newsletter items for account ${accountId}`);
  return newItems;
}

/**
 * Get newsletter digest with deduplication.
 * @param {string} accountId
 * @param {number} days - How many days back to look
 * @returns {Array} Deduplicated news items
 */
export async function getDigest(accountId, days = 4) {
  const db = getSupabase();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: items } = await db.from('news_items')
    .select('*')
    .eq('account_id', accountId)
    .gte('published_at', since)
    .order('published_at', { ascending: false });

  if (!items || items.length === 0) return [];

  // Group by cluster_id
  const clusters = new Map();
  const unclustered = [];

  for (const item of items) {
    if (item.cluster_id) {
      if (!clusters.has(item.cluster_id)) {
        clusters.set(item.cluster_id, []);
      }
      clusters.get(item.cluster_id).push(item);
    } else {
      unclustered.push(item);
    }
  }

  // Build digest entries
  const digest = [];

  // Clustered items — collapse to one entry per cluster
  for (const [clusterId, clusterItems] of clusters) {
    const primary = clusterItems[0]; // Use first item as primary
    const sources = [...new Set(clusterItems.map((i) => i.source_name).filter(Boolean))];

    digest.push({
      id: primary.id,
      headline: primary.title,
      summary: primary.summary,
      sources,
      deduplicatedCount: clusterItems.length,
      isDeduplicated: clusterItems.length > 1,
      category: 'Newsletter',
      url: primary.url,
    });
  }

  // Unclustered items — show individually
  for (const item of unclustered) {
    digest.push({
      id: item.id,
      headline: item.title,
      summary: item.summary,
      sources: [item.source_name].filter(Boolean),
      deduplicatedCount: 1,
      isDeduplicated: false,
      category: 'Newsletter',
      url: item.url,
    });
  }

  return digest;
}

// ================================================================
// Helpers
// ================================================================

async function extractNewsItems(msg) {
  const prompt = PROMPTS.newsletterExtract(msg.subject, msg.from_address, msg.body_text);
  const result = await aiGenerate('generate', {
    prompt,
    opts: { temperature: 0.1, maxTokens: 1000, responseMimeType: 'application/json' },
  });

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const items = JSON.parse(cleaned);
    return Array.isArray(items) ? items : [];
  } catch {
    logger.warn(`Failed to parse newsletter extraction for message ${msg.id}`);
    return [];
  }
}

/**
 * Greedy pairwise clustering of news items by embedding similarity.
 * Simple and effective at this scale — no heavy clustering library needed.
 */
async function clusterNewsItems(accountId) {
  const db = getSupabase();

  const { data: items } = await db.from('news_items')
    .select('id, embedding, cluster_id')
    .eq('account_id', accountId)
    .not('embedding', 'is', null);

  if (!items || items.length < 2) return;

  // Parse embeddings
  const parsed = items.map((item) => ({
    id: item.id,
    embedding: typeof item.embedding === 'string' ? JSON.parse(item.embedding) : item.embedding,
    clusterId: item.cluster_id,
  }));

  // Greedy pairwise clustering
  const assigned = new Set();
  const clusters = [];

  for (let i = 0; i < parsed.length; i++) {
    if (assigned.has(parsed[i].id)) continue;

    const cluster = [parsed[i]];
    assigned.add(parsed[i].id);

    for (let j = i + 1; j < parsed.length; j++) {
      if (assigned.has(parsed[j].id)) continue;

      const similarity = cosineSimilarity(parsed[i].embedding, parsed[j].embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        cluster.push(parsed[j]);
        assigned.add(parsed[j].id);
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  // Assign cluster IDs
  for (const cluster of clusters) {
    const clusterId = crypto.randomUUID();
    for (const item of cluster) {
      await db.from('news_items').update({ cluster_id: clusterId }).eq('id', item.id);
    }
  }

  logger.info(`Clustered ${clusters.length} groups of duplicate newsletter items`);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractSourceName(fromAddress) {
  if (!fromAddress) return 'Unknown';
  const match = fromAddress.match(/^(.+?)\s*</);
  return match ? match[1].replace(/"/g, '').trim() : fromAddress.split('@')[0];
}
