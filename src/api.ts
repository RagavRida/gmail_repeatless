/**
 * API client for the Gmail Repeatless backend.
 * Centralizes all fetch calls so components stay clean.
 */

const API_BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Send session cookies
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API error: ${res.status}`);
  }

  return res.json();
}

// ================================================================
// AUTH
// ================================================================

export async function getAuthSession() {
  return request('/auth/session');
}

export async function getAuthUrl() {
  return request('/auth/google/url');
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' });
}

// ================================================================
// SYNC
// ================================================================

export async function startSync(type: 'full' | 'incremental' = 'incremental') {
  return request('/sync/start', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export async function getSyncStatus() {
  return request('/sync/status');
}

// ================================================================
// THREADS
// ================================================================

export async function getThreads(params: { category?: string; page?: number; pageSize?: number; q?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.category && params.category !== 'All') searchParams.set('category', params.category);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params.q) searchParams.set('q', params.q);

  const qs = searchParams.toString();
  return request(`/threads${qs ? `?${qs}` : ''}`);
}

export async function getThread(threadId: string) {
  return request(`/threads/${threadId}`);
}

export async function summarizeThread(threadId: string) {
  return request(`/threads/${threadId}/summarize`, { method: 'POST' });
}

// ================================================================
// COMPOSE
// ================================================================

export async function composeDraft(params: { prompt: string; tone?: string; recipient?: string; subject?: string }) {
  return request('/compose', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function composeReply(threadId: string, params: { prompt: string; tone?: string }) {
  return request(`/threads/${threadId}/reply`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function sendEmail(params: { to: string; subject: string; body: string; threadId?: string; draftId?: string }) {
  return request('/send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ================================================================
// CATEGORIES
// ================================================================

export async function getCategories() {
  return request('/categories');
}

// ================================================================
// CHAT
// ================================================================

export async function createConversation() {
  return request('/chat/conversations', { method: 'POST' });
}

export async function getConversations() {
  return request('/chat/conversations');
}

export async function getConversationMessages(conversationId: string) {
  return request(`/chat/conversations/${conversationId}/messages`);
}

export async function sendChatMessage(conversationId: string, message: string) {
  return request(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

// ================================================================
// NEWSLETTERS
// ================================================================

export async function getNewsletterDigest(days: number = 4) {
  return request(`/newsletters/digest?days=${days}`);
}
