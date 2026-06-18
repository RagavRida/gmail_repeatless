# Architecture & Design Document

## Gmail Repeatless — AI-Powered Gmail Intelligence Platform

---

## 1. System Architecture

### High-Level Overview

Gmail Repeatless is a **monolithic full-stack application** with a React (Vite) frontend served by an Express.js backend. All AI processing, Gmail synchronization, and data persistence are managed by the single Express process — no external queues, no separate workers.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Browser                               │
│  ┌───────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐ ┌─────────┐ │
│  │   Inbox   │ │ AI Chat  │ │ Compose │ │Categories │ │  News   │ │
│  └─────┬─────┘ └─────┬────┘ └────┬────┘ └─────┬─────┘ └────┬────┘ │
│        └──────────────┴──────────┴─────────────┴────────────┘      │
│                               │ fetch(/api/*)                       │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      Express.js Backend (port 3001)                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                      Middleware Layer                         │    │
│  │  requireAuth → rateLimiter → errorHandler → requestLogger   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Auth Routes│  │Sync Routes│  │Chat Routes│  │ Category / News  │  │
│  │ /api/auth  │  │ /api/sync │  │ /api/chat │  │ /api/categories  │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬────┘  └────────┬─────────┘  │
│        │              │              │                  │            │
│  ┌─────▼──────────────▼──────────────▼──────────────────▼────────┐  │
│  │                    Service Layer                               │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │  │
│  │  │Categorization│ │Summarization │ │     Chat Agent       │   │  │
│  │  │   Service    │ │   Service    │ │  (RAG Pipeline)      │   │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘   │  │
│  │         └────────────────┴────────────────────┘               │  │
│  │                          │                                     │  │
│  │              ┌───────────▼────────────┐                       │  │
│  │              │      AI Router         │                       │  │
│  │              │  Priority: interactive │                       │  │
│  │              │  > background tasks    │                       │  │
│  │              │  Retry + fallback      │                       │  │
│  │              └───┬──────────────┬─────┘                       │  │
│  │                  │              │                              │  │
│  └──────────────────┼──────────────┼─────────────────────────────┘  │
│                     │              │                                  │
└─────────────────────┼──────────────┼─────────────────────────────────┘
                      │              │
          ┌───────────▼──┐    ┌──────▼──────────┐
          │  Gemini API  │    │  NVIDIA NIM API  │
          │  2.5 Flash   │    │  Llama 3.1 8B    │
          │  + Embedding │    │  (OpenAI compat) │
          └──────────────┘    └─────────────────┘
                      │
    ┌─────────────────┼───────────────────┐
    │                 │                   │
    ▼                 ▼                   ▼
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ Gmail    │  │   Supabase   │  │   Supabase   │
│ API v1   │  │  (Postgres)  │  │  (pgvector)  │
│          │  │  Relational  │  │  Embeddings  │
└──────────┘  └──────────────┘  └──────────────┘
```

### Component Interaction Flow

**Sync Flow (Click "Sync" button):**
1. Frontend → `POST /api/sync/start` → Express responds immediately with `{status: "started"}`
2. Background: `incrementalSync()` calls Gmail `history.list` to get new message IDs
3. New messages fetched via `messages.get` with bounded concurrency (`p-limit(5)`)
4. **Priority Processing**: New messages categorized + embedded immediately (blocking)
5. **Background Processing**: Old uncategorized/un-embedded messages continue asynchronously

**Chat Flow (AI Agent):**
1. Frontend → `POST /api/chat/conversations/:id/messages`
2. `processMessage()` detects query type (newsletter vs. general)
3. **General**: 4-step RAG pipeline → Filter extraction → Hybrid retrieval → Grounded generation → Source attribution
4. **Newsletter**: Specialized pipeline → Date parsing → Newsletter DB query → AI extraction per email → Deduplication → Synthesis
5. Response includes content + citations array

**AI Router Priority System:**
- Interactive requests (chat, compose) increment `_interactivePending` counter
- Background tasks (categorization, embedding) call `waitForInteractive()` to yield
- Interactive tasks get retry with exponential backoff (3s → 6s → 12s)
- Background tasks get single attempts with no retry

### Deployment Model

**Single-process deployment**: Express serves both the API and the Vite-built SPA from `dist/`. In production, `npm run build` creates static assets, and `node server.js` serves everything from one port. No CORS configuration needed, no reverse proxy required.

---

## 2. Database Schema

### Schema Diagram

```
┌──────────────────┐     ┌──────────────────────────────────────────────┐
│    accounts      │     │                  messages                     │
├──────────────────┤     ├──────────────────────────────────────────────┤
│ id (uuid) PK     │◄──┐ │ id (text) PK         ← Gmail message ID     │
│ google_email UK  │   │ │ thread_id (text) FK  → threads.id            │
│ access_token_enc │   ├─│ account_id (uuid) FK → accounts.id           │
│ refresh_token_enc│   │ │ internal_date        (timestamptz)           │
│ token_expiry     │   │ │ from_address, to_addresses, cc_addresses     │
│ gmail_history_id │   │ │ subject, snippet, body_text, body_html       │
│ last_full_sync   │   │ │ category             (enum, 7 values)       │
│ last_incr_sync   │   │ │ ai_summary           (text, cached)         │
└──────────────────┘   │ │ embedding            (vector(768))          │
                       │ │ fts                  (tsvector, generated)  │
┌──────────────────┐   │ │ is_from_user         (boolean)              │
│    threads       │   │ └──────────────────────────────────────────────┘
├──────────────────┤   │
│ id (text) PK     │◄──┤ ┌──────────────────────────────────────────────┐
│ account_id FK    │───┘ │              sync_jobs                       │
│ subject, snippet │     ├──────────────────────────────────────────────┤
│ participants     │     │ id (uuid) PK                                 │
│ message_count    │     │ account_id FK → accounts.id                  │
│ last_message_at  │     │ type (full | incremental)                    │
│ category (enum)  │     │ status (running | completed | failed)        │
│ ai_summary       │     │ stats (jsonb)                                │
│ is_unread        │     └──────────────────────────────────────────────┘
│ gmail_label_ids  │
└──────────────────┘     ┌──────────────────────────────────────────────┐
                         │           chat_conversations                 │
┌──────────────────┐     ├──────────────────────────────────────────────┤
│     drafts       │     │ id (uuid) PK                                 │
├──────────────────┤     │ account_id FK → accounts.id                  │
│ id (uuid) PK     │     │ title (text)                                 │
│ account_id FK    │     └──────────────────────────────────────────────┘
│ thread_id FK     │                         │
│ kind (new|reply) │     ┌───────────────────▼──────────────────────────┐
│ prompt, subject  │     │            chat_messages                      │
│ body, status     │     ├──────────────────────────────────────────────┤
│ gmail_draft_id   │     │ id (uuid) PK                                 │
└──────────────────┘     │ conversation_id FK → chat_conversations.id   │
                         │ role (user | assistant)                       │
┌──────────────────┐     │ content (text)                                │
│   news_items     │     │ sources (jsonb) — [{message_id, subject...}] │
├──────────────────┤     └──────────────────────────────────────────────┘
│ id (uuid) PK     │
│ account_id FK    │
│ source_msg_id FK │
│ title, summary   │
│ embedding v(768) │
│ cluster_id       │
└──────────────────┘
```

### 7 Tables — Design Decisions

| Table | Purpose | Key Design Decision |
|---|---|---|
| **accounts** | Connected Gmail accounts | Tokens encrypted with AES-256-GCM (not plaintext). `gmail_history_id` stored for incremental sync resume. |
| **threads** | Gmail thread grouping | `category` is a single enum, not many-to-many. At inbox scale (< 10K threads), one category per thread is sufficient and avoids join complexity. |
| **messages** | Individual emails + AI data | Core table. Stores `embedding vector(768)` for semantic search and auto-generated `fts tsvector` for full-text search. Both search strategies live on the same row — no separate tables. |
| **sync_jobs** | Sync operation tracking | `stats jsonb` is flexible — tracks `{fetched, processed, errors}` for full sync and `{added, deleted, modified}` for incremental. |
| **drafts** | AI-generated email drafts | `kind` (new/reply) determines whether to include thread context. `gmail_draft_id` links to actual Gmail draft after submission. |
| **chat_conversations** / **chat_messages** | Conversational AI agent | `sources jsonb` on each assistant message stores the exact email IDs used — enables citation linking. Conversation history enables follow-up resolution. |
| **news_items** | Newsletter deduplication | `cluster_id` groups duplicate items across newsletters. `embedding vector(768)` enables cosine similarity clustering. |

### Indexes

```sql
-- Full-text search (GIN index for tsvector)
idx_messages_fts          ON messages USING gin (fts)

-- Time-series access pattern (inbox sorted by date)
idx_messages_account_date ON messages (account_id, internal_date DESC)

-- Thread lookup
idx_messages_thread       ON messages (thread_id)

-- Category filtering
idx_threads_account_category ON threads (account_id, category)

-- Thread list sorted by recency
idx_threads_account_date  ON threads (account_id, last_message_at DESC)
```

### What is Being Embedded and Why

**Messages (`embedding vector(768)`):** Each email is embedded as `subject + body_text` (truncated to 2000 chars) using `gemini-embedding-001` at 768 dimensions. This powers semantic search in the RAG pipeline — the user can ask "emails about the project deadline" and match emails that say "the sprint ends Friday" without sharing keywords.

**News items (`embedding vector(768)`):** Newsletter items are embedded for cross-source deduplication. Two newsletters covering the same story produce items with cosine similarity ≥ 0.85, which are clustered together.

**Why 768 dimensions?** This is the native dimension of `gemini-embedding-001`. We use it directly without PCA or dimension reduction — at our scale (< 10K vectors), HNSW indexing is fast enough.

---

## 3. AI Design

### 3.1 Email Summarization

**Per-message summarization:**
- Triggered during sync (not on-read), so summaries are cached
- Prompt: `"Summarize the following email in 1-2 concise sentences. Focus on key action items, decisions, or information. Do not add information not present in the email."`
- Input: `subject + from + body_text` (full body, not chunked)
- Output cached in `messages.ai_summary` — never regenerated unless manually triggered

**Thread-level summarization:**
- All messages in the thread are fed in **chronological order** as a single prompt
- Prompt: `"Summarize the following email thread as a coherent narrative. Cover key events, decisions, and current status. Mention specific senders when attributing actions."`
- Each message includes `from_address`, `internal_date`, and `body_text`
- This gives the model full conversational context — it understands "Re:" chains and reply context

**Chunking strategy for long threads:**
- Individual messages are passed in full (Gemini 2.5 Flash has 1M token context)
- Body text is not chunked for summarization — the model sees the entire email
- For embedding, body text is truncated to 2000 characters (embedding models have smaller context windows)

### 3.2 Chat Agent — RAG Pipeline

The chat agent uses a **4-step RAG pipeline** with hybrid retrieval:

```
User Question
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ Step 1: Filter Extraction (AI-powered)                  │
│                                                         │
│ Input: "What did Sarah say about the budget last week?" │
│ Output: {                                               │
│   sender: "sarah",                                      │
│   date_from: "2026-06-11",                              │
│   date_to: "2026-06-18",                                │
│   search_terms: "budget",                               │
│   expanded_terms: "finance cost expense spending"       │
│ }                                                       │
│                                                         │
│ The model generates synonym expansions to improve recall │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: Hybrid Retrieval (3 parallel strategies)        │
│                                                         │
│ Strategy A: pgvector cosine similarity                  │
│   → match_messages RPC (top 8 by embedding distance)    │
│                                                         │
│ Strategy B: PostgreSQL tsvector full-text search         │
│   → search_messages_fts RPC (top 8 by ts_rank)          │
│                                                         │
│ Strategy C: Direct ILIKE search (fallback)              │
│   → Subject/snippet/body_text keyword matching          │
│   → Primary terms scored at 0.6, expanded at 0.35       │
│                                                         │
│ All results merged into a Map (deduplicated by msg ID)  │
│ Sorted by score, top 15 retained                        │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: Grounded Generation                             │
│                                                         │
│ System prompt: "Answer from provided context ONLY.      │
│ If the emails don't contain the answer, say so."        │
│                                                         │
│ Context block format for each email:                    │
│   📧 From: [sender] | Date: [date] | Subject: [subj]   │
│   [body_text truncated to 500 chars]                    │
│                                                         │
│ Conversation history (last 6 turns) injected for        │
│ follow-up resolution                                    │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: Source Attribution                              │
│                                                         │
│ Response includes:                                      │
│ - content: AI-generated answer text                     │
│ - sources: [{message_id, thread_id, subject, from}]     │
│ - citations: [{sender, senderEmail, subject, time}]     │
│                                                         │
│ Citations rendered as clickable badges in the UI        │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Source Clarity Across Multiple Emails

1. **Context block formatting**: Each email in the RAG context is wrapped with explicit metadata (`From`, `Date`, `Subject`). The model can attribute statements to specific senders.
2. **Citation tracking**: Every source email used in generation is tracked in the `sources` jsonb column. The frontend renders these as citation badges.
3. **Conversation history**: The last 6 conversation turns are injected, so follow-up questions ("what else did they say?") resolve correctly.
4. **Deduplicated citations**: If the same sender/subject appears multiple times, citations are collapsed.

### 3.4 Why NVIDIA NIM (Llama 3.1 8B)?

| Factor | Rationale |
|---|---|
| **Task fit** | Email categorization is a 6-class text classification task. An 8B parameter model handles this reliably — no need for a 175B+ model. |
| **Rate limit relief** | Gemini free tier is 15-20 RPM for `generateContent`. Using NIM for the high-volume classification task (1 call per email) keeps Gemini quota available for complex reasoning tasks (summarization, RAG, compose). |
| **Cost efficiency** | NIM provides 1000 free API calls. Classification prompts are short (~200 tokens). This goes a long way for batch processing. |
| **OpenAI-compatible API** | NIM uses the standard `chat.completions` format. Swapping models (Llama 3.1 8B → Mistral 7B, etc.) requires changing one config line. |
| **Fallback architecture** | NIM is primary for `classify`, Gemini is fallback. Gemini is primary for `generate/chat`, NIM is fallback. Both providers cover each other's downtime. |

### 3.5 Preventing Hallucination

| Mechanism | How It Works |
|---|---|
| **Grounding instruction** | System prompt: *"Answer from provided context ONLY. If the emails don't contain the answer, say so clearly."* |
| **Context-only generation** | The synthesis prompt includes only retrieved emails, not the model's parametric knowledge. |
| **No-results handling** | If hybrid retrieval returns 0 results, the system returns a canned "I couldn't find relevant emails" message instead of letting the model generate freely. |
| **Low temperature** | Generation uses `temperature: 0.3` — deterministic enough to avoid creative fabrication. |
| **Source attribution** | Every response includes citations. Users can verify claims against the original emails. |
| **Input sanitization** | User messages are trimmed to 2000 characters. This prevents prompt injection via extremely long inputs. |

---

## 4. Gmail API Strategy

### 4.1 Initial Sync vs. Incremental Sync

**Full Sync (first-time or recovery):**
```
messages.list(maxResults=100)  →  Page 1: 100 message IDs
        ↓ pageToken
messages.list(pageToken=...)   →  Page 2: 100 message IDs
        ↓ pageToken
        ...
messages.list(pageToken=...)   →  Page N: remaining IDs
        ↓
For each ID: messages.get(id, format='full')  →  Parse headers + body
        ↓
Upsert into Supabase (messages + threads tables)
        ↓
Store final historyId for next incremental sync
```

- `messages.list` returns only IDs (lightweight)
- `messages.get` fetches full content (heavyweight) — bounded to 5 concurrent requests via `p-limit`
- `historyId` from the final response is stored in `accounts.gmail_history_id`
- Sync progress tracked in `sync_jobs` table (`{fetched, processed, errors}`)

**Incremental Sync (subsequent syncs):**
```
history.list(startHistoryId=stored_id)
        ↓
Returns: messagesAdded[], messagesDeleted[], labelsAdded[], labelsRemoved[]
        ↓
For messagesAdded:  fetchAndPersistMessage() + track newMessageIds[]
For messagesDeleted: DELETE from messages
For labelsAdded/Removed: UPDATE label arrays
        ↓
Priority processing: categorize + embed new messages FIRST
Background: process remaining old messages
```

- If `historyId` is expired (Gmail returns 404), falls back to full sync automatically
- The `newMessageIds` array enables **priority processing** — new emails are categorized and embedded before the response is sent to old uncategorized emails

### 4.2 Pagination for Large Inboxes

- **Page size**: 100 messages per `messages.list` call (Gmail API maximum)
- **Cursor-based**: Uses `pageToken` (not offset) — handles inbox mutations during sync
- **Progressive**: Each page is processed immediately (messages fetched and persisted) before requesting the next page. This means partial sync state is preserved if the process crashes.
- **Tested at scale**: Successfully synced 2,700+ messages with stable performance

### 4.3 Rate Limiting and Quota Handling

**Gmail API (via `withBackoff`):**
```javascript
// Exponential backoff with jitter
delay = min(500ms × 2^attempt, 32000ms) + random(0-250ms)

// Honors Retry-After header from Gmail
if (retryAfter) delay = max(delay, retryAfter × 1000)

// Retries on: 429 (rate limit), 403 (rateLimitExceeded), 5xx (server error)
// Throws on: 4xx (client errors), 404 (not found)
// Max retries: 5
```

**AI API (via `aiGenerate` router):**
- Interactive tasks (chat, compose): Retry with backoff (3s → 6s → 12s), max 3 retries
- Background tasks (categorization, embedding): Single attempt, no retry
- Background tasks yield to interactive via `waitForInteractive()` — prevents quota starvation
- If both providers (Gemini + NIM) return 429, user gets a friendly message: *"Please try again in 30 seconds"*

**Concurrency control:**
- Gmail API: `p-limit(5)` — max 5 concurrent `messages.get` requests
- AI categorization: Sequential with 500ms throttle between calls
- AI embedding: 300ms throttle for new emails, 1000ms for background

---

## 5. Tool & Technology Decisions

| Tool | Choice | Justification |
|---|---|---|
| **Frontend** | React + Vite + TypeScript | Vite provides instant HMR for dev speed. React is the ecosystem standard for component-based UIs. TypeScript catches type errors at build time. |
| **Styling** | Vanilla CSS | Full control over the design system. No utility class bloat. CSS variables for theming (dark mode). |
| **Backend** | Express.js (Node.js) | Lightweight, unopinionated. Gmail API has a first-party Node.js client (`googleapis`). Single-language stack (JS frontend + backend). |
| **Database** | Supabase (PostgreSQL) | Hosted Postgres with built-in `pgvector` extension. Row-level security possible. Generous free tier. PostgREST auto-generates APIs, but we use the JS client for flexibility. |
| **Vector DB** | pgvector (in Supabase) | No separate vector DB service needed. Vectors stored alongside relational data. `match_messages` RPC does filtered vector search in one query. At < 10K vectors, HNSW performance is excellent. |
| **Full-text search** | PostgreSQL tsvector | Free, built into Postgres. Auto-generated column (`fts tsvector generated always as...`). GIN-indexed. No external search service (Elasticsearch, Typesense) needed at this scale. |
| **Primary AI** | Gemini 2.5 Flash | 1M token context window (ideal for long email threads). Native JSON output mode. Embedding model (`gemini-embedding-001`) from the same provider. Free tier sufficient for development. |
| **Secondary AI** | NVIDIA NIM (Llama 3.1 8B) | Offloads classification from Gemini. OpenAI-compatible API. Fast inference for simple tasks. Free 1000 API calls. |
| **Auth** | Google OAuth2 + express-session | Gmail API requires OAuth anyway. Session-based auth (not JWT) — simpler for server-rendered redirects. Tokens encrypted with AES-256-GCM before storage. |
| **Job Queue** | None (in-process async) | No Redis, no Bull, no external queue. Background tasks run as fire-and-forget async IIFEs within the Express process. `waitForInteractive()` provides priority scheduling. At single-user scale, this is simpler and more debuggable than a queue. |
| **Deployment** | Single process | Express serves both API routes and static files from `dist/`. One `node server.js` command. No Docker, no Nginx, no PM2 — keep it simple for development. |

---

## 6. Trade-offs & Limitations

### What We Deliberately Simplified

| Simplification | Rationale | What We'd Do Differently |
|---|---|---|
| **No job queue** | In-process async is sufficient for single-user. Adding Redis + Bull would increase infra complexity without improving UX. | For multi-user: Redis-backed BullMQ with dedicated worker processes. |
| **Single-value category** | An email is either "newsletter" OR "finance", not both. At inbox scale, one category captures the dominant intent cleanly. | Multi-label classification with confidence scores. |
| **No real-time push** | Frontend polls `/api/sync/status`. No WebSocket for live updates when sync completes. | WebSocket or SSE for real-time sync progress and new email notifications. |
| **No attachment handling** | We extract `text/plain` and `text/html` bodies but skip PDF, DOCX, image attachments. | Process attachments with document extraction (Tika, PDF.js) and include in embeddings. |
| **No email threading in replies** | AI compose generates RFC 2822 `In-Reply-To`/`References` headers, but doesn't handle complex multi-branch thread structures. | Full thread tree visualization with branch-aware replies. |
| **Free-tier rate limits** | Gemini free tier is 15-20 RPM. Background categorization competes with interactive chat for quota. | Paid Gemini tier (1000+ RPM) or self-hosted model for classification. |

### Known Limitations

1. **Rate limit contention**: On free-tier Gemini, syncing 500+ emails and using chat simultaneously will trigger 429s. The priority system mitigates this (interactive > background), but background tasks will stall.

2. **No offline support**: The app requires an active connection to Gmail API and Supabase. No local cache or service worker.

3. **Single-user architecture**: The session-based auth and in-process background tasks assume one user. Multi-user would need per-user queues and connection pooling.

4. **Embedding coverage**: Embeddings are generated progressively (throttled to respect rate limits). A freshly synced inbox may have 0% embedding coverage for several minutes. FTS and ILIKE searches work as fallbacks during this period.

5. **No re-ranking**: Retrieved results are merged by score but not re-ranked by a cross-encoder. Adding a re-ranking step (e.g., Cohere Rerank or a cross-encoder) would improve retrieval precision for ambiguous queries.

### What We'd Build With More Time

1. **Webhook-based sync**: Gmail Push Notifications (`watch` + Pub/Sub) instead of manual "Sync" button — emails arrive in real-time
2. **Multi-user with queues**: BullMQ workers for categorization/embedding, per-user rate limiting
3. **Cross-encoder re-ranking**: After hybrid retrieval, re-rank top 20 results with a cross-encoder for better precision
4. **Email rules engine**: User-defined automation ("if email from X about Y, label as Z and draft reply")
5. **Attachment RAG**: Process PDF/DOCX attachments, add to vector space, include in chat agent retrieval
6. **Analytics dashboard**: Email volume trends, response times, category distributions, sender frequency
