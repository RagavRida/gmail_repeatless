/**
 * NVIDIA NIM client wrapper.
 * Uses the OpenAI-compatible endpoint via the openai npm package.
 * Role: high-volume classification (email categorization) + fallback for Gemini failures.
 */
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { logger } from '../middleware/logger.js';

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: config.nim.apiKey,
      baseURL: config.nim.baseUrl,
    });
  }
  return client;
}

/**
 * Generate a completion from the NIM model.
 * @param {string} prompt - User prompt
 * @param {object} opts - { systemPrompt?, temperature?, maxTokens? }
 * @returns {string} Generated text
 */
export async function nimComplete(prompt, opts = {}) {
  const nim = getClient();
  const logEnd = logger.apiCall('NIM', 'chat.completions');

  try {
    const messages = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await nim.chat.completions.create({
      model: config.nim.model,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 256,
    });

    const text = response.choices?.[0]?.message?.content || '';
    logEnd('success');
    return text.trim();
  } catch (error) {
    logEnd('failure', error.message);
    throw error;
  }
}

/**
 * Multi-turn chat with NIM.
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} opts
 * @returns {string}
 */
export async function nimChat(messages, opts = {}) {
  const nim = getClient();
  const logEnd = logger.apiCall('NIM', 'chat.completions');

  try {
    const formattedMessages = [];
    if (opts.systemPrompt) {
      formattedMessages.push({ role: 'system', content: opts.systemPrompt });
    }
    formattedMessages.push(...messages);

    const response = await nim.chat.completions.create({
      model: config.nim.model,
      messages: formattedMessages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1024,
    });

    const text = response.choices?.[0]?.message?.content || '';
    logEnd('success');
    return text.trim();
  } catch (error) {
    logEnd('failure', error.message);
    throw error;
  }
}
