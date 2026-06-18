# Gmail Repeatless

**AI-powered Gmail intelligence platform — sync, categorize, summarize, compose, and chat with your inbox.**

Built with Node.js · Express · Supabase (pgvector) · Gemini 2.5 Flash · NVIDIA NIM

---

## Quick Start

```bash
# 1. Clone & install
git clone <repo-url> && cd gmail_repeatless
npm install && cd backend && npm install && cd ..

# 2. Configure
cp backend/.env.example backend/.env   # Fill in credentials

# 3. Database (run in Supabase SQL Editor)
#    → backend/src/db/schema.sql
#    → backend/src/db/functions.sql

# 4. Build & run
npm run build && cd backend && npm start
# → http://localhost:3001
```

<details>
<summary><strong>Development mode (two terminals)</strong></summary>

```bash
# Terminal 1: Frontend with HMR
npm run dev

# Terminal 2: Backend with watch
cd backend && npm run dev
```

Vite proxies `/api/*` to Express on port 3001.
</details>

<details>
<summary><strong>Google OAuth setup</strong></summary>

1. [Google Cloud Console](https://console.cloud.google.com/) → Create OAuth2 credentials (Web Application)
2. Redirect URI: `http://localhost:3001/api/auth/google/callback`
3. Enable Gmail API
4. Add your email as a test user (OAuth consent screen → Test users)
</details>

---

## Architecture

```mermaid
graph TB
    subgraph Frontend["React Frontend (Vite)"]
        Inbox["📥 Inbox"]
        Chat["💬 AI Chat Agent"]
        Compose["✍️ Compose"]
        Categories["🏷️ Categories"]
        News["📰 Newsletter Digest"]
    end

    Frontend -->|"fetch(/api/*)"| Backend

    subgraph Backend["Express API Server"]
        direction LR
        subgraph Auth["Auth"]
            OAuth2["OAuth2"]
            Session["Session"]
            AES["AES-256-GCM"]
        end
        subgraph Gmail["Gmail"]
            Sync["Sync"]
            Backoff["Backoff"]
            MIME["MIME Builder"]
        end
        subgraph AIRouter["AI Router"]
            Gemini["Gemini 2.5 Flash"]
            NIM["NIM Llama 3.1 8B"]
        end
        subgraph Services["Services"]
            ChatRAG["Chat RAG"]
            Summarize["Summarize"]
            Categorize["Categorize"]
            ComposeS["Compose"]
            Newsletter["Newsletter Dedup"]
        end
    end

    Backend --> Supabase[("Supabase\nPostgres + pgvector")]
    Backend --> GmailAPI["Gmail API v1"]
    Backend --> AIAPI["Gemini / NIM API"]

    style Frontend fill:#1a1a2e,stroke:#6c63ff,color:#fff
    style Backend fill:#16213e,stroke:#0f3460,color:#fff
    style Supabase fill:#3ecf8e,stroke:#2da77a,color:#fff
    style GmailAPI fill:#ea4335,stroke:#c5221f,color:#fff
    style AIAPI fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

**Single-service deployment**: Express serves both the API and the Vite-built SPA from `dist/`. One process, no CORS, no reverse proxy.

---

## Features

### 1. Gmail Sync & Integration

| Capability | Implementation |
|---|---|
| **OAuth 2.0** | Google consent → code exchange → AES-256-GCM encrypted token storage |
| **Full sync** | Paginated `messages.list` with bounded concurrency (`p-limit(5)`) |
| **Incremental sync** | `history.list` from stored `historyId` — fetches only deltas |
| **Rate limiting** | Exponential backoff with jitter, `Retry-After` header support, 429/403/5xx handling |
| **Thread building** | Messages auto-grouped into thread records; progressive build during sync |

Tested with **2,700+ messages** — handles pagination, thread building, and progressive UI updates without degradation.

### 2. Email Summarization

- **Per-message**: Generated during sync, cached in DB (not regenerated on read)
- **Per-thread**: Understands the full conversation arc — all messages fed in chronological order
- **Context-aware**: Replies understood in context of the thread, not in isolation

### 3. Compose & Reply

- **Compose**: Natural-language prompt → AI generates subject + body → user reviews/edits → sends via Gmail API
- **Reply**: Full thread history injected into prompt → contextual reply with correct tone
- **Threading**: RFC 2822 compliant MIME with `In-Reply-To` and `References` headers — replies appear correctly in Gmail threads

### 4. Email Categorization

Six categories: **Newsletter** · **Job/Recruitment** · **Finance** · **Notifications** · **Personal** · **Work/Professional**

- NIM handles high-volume classification (primary); Gemini as fallback
- Thread-level propagation: dominant message category becomes the thread category
- Stored in Supabase, surfaced as filterable tabs in the UI

### 5. AI Chat Agent — RAG Pipeline

The centerpiece. A 4-step pipeline that treats the user's inbox as an exclusive knowledge base:

```mermaid
flowchart TD
    Q["🗣️ User Question"] --> F

    F["1️⃣ Filter Extraction\nParse implicit sender / date / category filters\ne.g. 'emails from Sarah about the trip'\n→ sender: sarah, search_terms: trip"]
    F --> R

    R["2️⃣ Hybrid Retrieval\npgvector cosine similarity + tsvector full-text search\nMerged and deduplicated"]
    R --> V[("Supabase\nmatch_messages RPC\nsearch_messages_fts RPC")]
    V --> R
    R --> G

    G["3️⃣ Grounded Generation\nGemini answers from retrieved context ONLY\nNo hallucination — 'if not in context, say so'"]
    G --> S

    S["4️⃣ Source Attribution\nCitation badges linking to source emails\nConversation history for follow-up resolution"]
    S --> A["✅ Response with Citations"]

    style Q fill:#6c63ff,stroke:#5a52d5,color:#fff
    style F fill:#1e3a5f,stroke:#2d5a8e,color:#fff
    style R fill:#1e3a5f,stroke:#2d5a8e,color:#fff
    style G fill:#1e3a5f,stroke:#2d5a8e,color:#fff
    style S fill:#1e3a5f,stroke:#2d5a8e,color:#fff
    style V fill:#3ecf8e,stroke:#2da77a,color:#fff
    style A fill:#10b981,stroke:#059669,color:#fff
```

Handles cross-email reasoning, multi-thread synthesis, and conversational follow-ups.

### 6. Newsletter Deduplication (Bonus)

- **Extract**: Gemini structured output pulls `{title, summary, url}` from newsletter bodies
- **Embed**: Each item embedded via `gemini-embedding-001` at 768 dimensions
- **Cluster**: Greedy pairwise cosine similarity (threshold ≥ 0.85)
- **Digest**: Clustered items collapsed to one entry, all source newsletters attributed

---

## AI Model Strategy

```mermaid
flowchart LR
    subgraph Router["AI Router"]
        direction TB
        Classify["🏷️ classify"]
        Generate["✨ generate"]
        ChatRAG["💬 chat / RAG"]
        Embed["🔢 embed"]
    end

    Classify -->|"Primary"| NIM["NIM\nLlama 3.1 8B"]
    Classify -.->|"Fallback"| GeminiC["Gemini 2.5 Flash"]
    Generate -->|"Primary"| GeminiG["Gemini 2.5 Flash"]
    Generate -.->|"Fallback"| NIMG["NIM"]
    ChatRAG -->|"Primary"| GeminiR["Gemini 2.5 Flash"]
    ChatRAG -.->|"Fallback"| NIMR["NIM"]
    Embed -->|"Primary"| GeminiE["Gemini Embedding"]

    style Router fill:#1a1a2e,stroke:#6c63ff,color:#fff
    style NIM fill:#76b900,stroke:#5a8f00,color:#fff
    style NIMG fill:#76b900,stroke:#5a8f00,color:#fff
    style NIMR fill:#76b900,stroke:#5a8f00,color:#fff
    style GeminiC fill:#4285f4,stroke:#3367d6,color:#fff
    style GeminiG fill:#4285f4,stroke:#3367d6,color:#fff
    style GeminiR fill:#4285f4,stroke:#3367d6,color:#fff
    style GeminiE fill:#4285f4,stroke:#3367d6,color:#fff
```

On failure (429, 500, timeout), the router automatically switches to the fallback provider. Both fail → clear error message, no silent degradation.

**Why two models?**
- **Gemini 2.5 Flash**: Excels at multi-step reasoning, 1M token context, native embeddings, structured JSON output. Used for RAG synthesis, thread-aware replies, and summarization.
- **NIM (Llama 3.1 8B)**: Lightweight, fast, no rate limit pressure. Email categorization is a 6-class classification task — an 8B model handles this reliably without burning Gemini quota.

---

## Database Schema

7 tables designed for email-first access patterns:

```mermaid
erDiagram
    accounts ||--o{ threads : "has"
    accounts ||--o{ messages : "has"
    accounts ||--o{ sync_jobs : "tracks"
    accounts ||--o{ chat_conversations : "owns"
    threads ||--o{ messages : "contains"
    threads ||--o{ drafts : "has"
    chat_conversations ||--o{ chat_messages : "contains"
    accounts ||--o{ news_items : "extracted from"

    accounts {
        uuid id PK
        text google_email UK
        text access_token_encrypted
        text refresh_token_encrypted
        bigint gmail_history_id
    }

    threads {
        text id PK
        uuid account_id FK
        text subject
        text category
        text ai_summary
        timestamp last_message_at
    }

    messages {
        text id PK
        text thread_id FK
        uuid account_id FK
        text subject
        text body_text
        text category
        text ai_summary
        vector embedding "768-dim"
        tsvector fts "generated"
    }

    drafts {
        uuid id PK
        text thread_id FK
        text subject
        text body
        text prompt
    }

    chat_conversations {
        uuid id PK
        uuid account_id FK
        text title
    }

    chat_messages {
        uuid id PK
        uuid conversation_id FK
        text role
        text content
        jsonb sources
    }

    news_items {
        uuid id PK
        uuid account_id FK
        text title
        text summary
        vector embedding "768-dim"
        uuid cluster_id
    }
```

| Table | Purpose | Key Design Choices |
|---|---|---|
| `accounts` | Connected Gmail accounts | AES-256-GCM encrypted OAuth tokens |
| `threads` | Gmail threads as first-class entities | Single category (not M:N), AI summary cached |
| `messages` | Individual emails | `vector(768)` embeddings, `tsvector` FTS column |
| `sync_jobs` | Sync operation tracking | Resumability, progress monitoring |
| `drafts` | AI-generated email drafts | Audit trail (prompt → draft → sent) |
| `chat_conversations` / `chat_messages` | AI chat history | Source citations persisted per message |
| `news_items` | Newsletter items for dedup | Embeddings + `cluster_id` for similarity grouping |

**Design decisions:**
- **Category as single value**: Most emails have one dominant category. A tags table adds joins for minimal benefit at this scale.
- **768-dim embeddings**: `gemini-embedding-001` with `output_dimensionality: 768` — compact, fast, semantically rich. 10K emails ≈ 30MB index.
- **Hybrid search**: Vector misses exact terms ("CVE-2026-1182"); FTS misses semantics ("billing" ≈ "overages"). The RAG pipeline merges both.
- **Encrypted tokens**: Even a full database dump reveals nothing useful. ~30 lines using Node.js built-in `crypto`.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/google/url` | Google OAuth consent URL |
| `GET` | `/api/auth/google/callback` | OAuth2 callback handler |
| `GET` | `/api/auth/session` | Check current auth session |
| `POST` | `/api/auth/logout` | Destroy session |
| `POST` | `/api/sync/start` | Start full or incremental sync |
| `GET` | `/api/sync/status` | Latest sync job status |
| `GET` | `/api/threads` | List threads (paginated, filterable by category) |
| `GET` | `/api/threads/:id` | Thread with full message data |
| `POST` | `/api/threads/:id/summarize` | Generate/refresh thread summary |
| `POST` | `/api/compose` | Generate new email draft from prompt |
| `POST` | `/api/threads/:id/reply` | Generate reply with thread context |
| `POST` | `/api/send` | Send email via Gmail API |
| `GET` | `/api/categories` | Category distribution stats |
| `POST` | `/api/chat/conversations` | Create new chat conversation |
| `GET` | `/api/chat/conversations` | List conversations |
| `POST` | `/api/chat/conversations/:id/messages` | Send message to AI chat agent |
| `GET` | `/api/newsletters/digest` | Deduplicated newsletter digest |

---

## Project Structure

```
gmail_repeatless/
├── src/                              # React frontend
│   ├── App.tsx                       # Main app with auth + sync flow
│   ├── api.ts                        # Centralized API client
│   ├── types.ts                      # TypeScript interfaces
│   └── components/                   # InboxView, AIChatAgent, ComposeView, etc.
├── backend/
│   ├── server.js                     # Express entry point (API + static)
│   ├── .env.example                  # Environment variable template
│   └── src/
│       ├── config/index.js           # Config + category mappings
│       ├── db/
│       │   ├── schema.sql            # Full database schema (7 tables)
│       │   ├── functions.sql         # pgvector RPC functions
│       │   └── client.js             # Supabase client singleton
│       ├── auth/
│       │   ├── oauth.js              # Google OAuth2 flow
│       │   ├── crypto.js             # AES-256-GCM token encryption
│       │   └── session.js            # Session middleware
│       ├── gmail/
│       │   ├── sync.js               # Full + incremental sync
│       │   ├── backoff.js            # Exponential backoff with jitter
│       │   ├── mime.js               # RFC 2822 message builder
│       │   └── client.js             # Gmail API client factory
│       ├── ai/
│       │   ├── router.js             # Dual-model routing + fallback
│       │   ├── gemini.js             # Gemini generation + embeddings
│       │   ├── nim.js                # NVIDIA NIM classification
│       │   └── prompts/index.js      # All prompt templates (one file)
│       ├── services/
│       │   ├── chatAgent.js          # RAG pipeline (4-step)
│       │   ├── summarization.js      # Per-message + per-thread
│       │   ├── categorization.js     # NIM→Gemini fallback chain
│       │   ├── compose.js            # Draft generation
│       │   └── newsletterDedup.js    # Extract → embed → cluster
│       ├── routes/                   # Express route handlers
│       └── middleware/               # Error handler, rate limiter, logger
└── evals/                            # Evaluation suite
    ├── run-evals.js                  # Main runner (unit, judge, human)
    ├── llm-judge.js                  # LLM-as-Judge with rubrics
    ├── human-eval.js                 # Human evaluation form generator
    ├── fixtures.js                   # 30+ test scenarios
    └── eval-*.js                     # Per-feature evaluation suites
```

---

## Evaluation Framework

Three-tier evaluation pyramid:

| Tier | Method | What It Tests |
|---|---|---|
| **Unit tests** | Keyword/structure assertions | Format, categories, required fields — fast, deterministic |
| **LLM-as-Judge** | Gemini evaluates with rubrics (1-5 scale) | Quality, conciseness, accuracy, hallucination — nuanced |
| **Human eval** | Manual scoring forms | Final sign-off on subjective quality |

```bash
cd evals && npm install

# Run all unit tests
node run-evals.js --mode unit

# Run LLM-as-Judge evaluation
node run-evals.js --mode judge

# Generate human evaluation forms
node run-evals.js --mode human
```

---

## Key Design Decisions

### Why single-service Express?
CORS elimination, single `npm start` deployment, zero setup friction for assessors. At scale, this would split into API Gateway + CDN.

### Why plain JavaScript (no TypeScript)?
The assessment values "functional over over-engineered." TypeScript adds a build step, `tsconfig.json`, and source maps for ~30 backend files. JSDoc provides type hints without build complexity.

### Why manual MIME (not Nodemailer)?
Gmail requires `In-Reply-To` and `References` headers for thread-correct replies. The MIME builder is ~60 lines. Nodemailer (2MB, 25 transitive deps) for header construction is excessive.

### Why category as single value (not M:N tags)?
The frontend treats category as a single badge. Most emails have one dominant category. A tags table adds 3 tables + JOINs for 6 categories — premature complexity. If multi-label were needed, `text[]` arrays work without join overhead.

### Why NOT ReAct/agent loops?
The RAG pipeline is a fixed 4-step sequence (filter → retrieve → generate → cite). Agentic loops introduce unpredictable latency and harder debugging. A fixed pipeline is more auditable and testable.

---

## Trade-offs & What Changes at Scale

| Decision | Current (Assessment) | At Scale (Production) |
|---|---|---|
| Session storage | In-memory | Redis with `connect-redis` |
| Sync architecture | Inline in request | BullMQ background job queue |
| Embedding generation | Synchronous per-message | Batch embeddings + Redis cache |
| Categorization model | NIM API per message | Fine-tuned Gemma 2 2B on GPU |
| Sync trigger | User-initiated | Gmail Watch API (push notifications) |
| Rate limiting | In-memory sliding window | Redis-based distributed limiter |
| Chat response | Full response | SSE/WebSocket streaming |
| Frontend hosting | Express-served SPA | CDN + API Gateway |

---

## Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=development

# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>

# Google OAuth2
GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-<secret>
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback

# AI Models
GEMINI_API_KEY=<gemini-key>
NVIDIA_NIM_API_KEY=<nim-key>

# Security
TOKEN_ENCRYPTION_KEY=<64-char-hex>    # openssl rand -hex 32
SESSION_SECRET=<64-char-hex>          # openssl rand -hex 32

# Frontend
FRONTEND_URL=http://localhost:3000
```

---

## Deployment

### Railway / Render

1. Push to GitHub
2. Connect repo in Railway/Render dashboard
3. Set environment variables in provider dashboard
4. Build command: `npm run build`
5. Start command: `cd backend && node server.js`
6. Update `GOOGLE_REDIRECT_URI` and `FRONTEND_URL` to production URL

The Express server automatically serves the Vite build from `dist/` and handles SPA routing with `trust proxy` enabled for secure cookies behind reverse proxies.
