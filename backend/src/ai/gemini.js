/**
 * Gemini AI wrapper: text generation + embeddings.
 * Uses @google/genai (the current unified SDK).
 */
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';
import { logger } from '../middleware/logger.js';

let ai = null;

function getClient() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return ai;
}

/**
 * Generate text content using Gemini.
 * @param {string} prompt - The prompt text
 * @param {object} opts - { systemInstruction?, temperature?, maxTokens? }
 * @returns {string} Generated text
 */
export async function generateContent(prompt, opts = {}) {
  const client = getClient();
  const model = config.gemini.chatModel;
  const logEnd = logger.apiCall('Gemini', 'generateContent');

  try {
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];

    const requestOpts = {
      model,
      contents,
    };

    if (opts.systemInstruction) {
      requestOpts.config = {
        systemInstruction: opts.systemInstruction,
      };
    }
    if (opts.temperature !== undefined) {
      requestOpts.config = { ...requestOpts.config, temperature: opts.temperature };
    }
    if (opts.maxTokens) {
      requestOpts.config = { ...requestOpts.config, maxOutputTokens: opts.maxTokens };
    }
    if (opts.responseMimeType) {
      requestOpts.config = { ...requestOpts.config, responseMimeType: opts.responseMimeType };
    }

    const response = await client.models.generateContent(requestOpts);
    const text = response.text || '';
    logEnd('success');
    return text;
  } catch (error) {
    logEnd('failure', error.message);
    throw error;
  }
}

/**
 * Generate text with conversation history (multi-turn).
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} opts
 * @returns {string}
 */
export async function generateChat(messages, opts = {}) {
  const client = getClient();
  const model = config.gemini.chatModel;
  const logEnd = logger.apiCall('Gemini', 'generateChat');

  try {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const requestOpts = {
      model,
      contents,
    };

    if (opts.systemInstruction) {
      requestOpts.config = {
        systemInstruction: opts.systemInstruction,
      };
    }
    if (opts.temperature !== undefined) {
      requestOpts.config = { ...requestOpts.config, temperature: opts.temperature };
    }
    if (opts.responseMimeType) {
      requestOpts.config = { ...requestOpts.config, responseMimeType: opts.responseMimeType };
    }

    const response = await client.models.generateContent(requestOpts);
    const text = response.text || '';
    logEnd('success');
    return text;
  } catch (error) {
    logEnd('failure', error.message);
    throw error;
  }
}

/**
 * Generate embeddings using Gemini embedding model.
 * Uses output_dimensionality: 768 for compact pgvector columns.
 * @param {string} text - Text to embed
 * @returns {number[]} Embedding vector (768 dimensions)
 */
export async function generateEmbedding(text) {
  const client = getClient();
  const model = config.gemini.embeddingModel;
  const logEnd = logger.apiCall('Gemini', 'embedContent');

  try {
    const response = await client.models.embedContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        outputDimensionality: config.gemini.embeddingDimensions,
      },
    });

    const embedding = response.embeddings?.[0]?.values;
    if (!embedding) throw new Error('No embedding returned');
    logEnd('success');
    return embedding;
  } catch (error) {
    logEnd('failure', error.message);
    throw error;
  }
}

/**
 * Batch embed multiple texts.
 * @param {string[]} texts
 * @returns {number[][]}
 */
export async function generateEmbeddings(texts) {
  // Process in small batches to avoid hitting limits
  const batchSize = 10;
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((t) => generateEmbedding(t)));
    results.push(...embeddings);
  }

  return results;
}
