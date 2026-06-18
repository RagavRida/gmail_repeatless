-- Gmail Repeatless: Full Database Schema
-- Run this in the Supabase SQL Editor to initialize the database

-- Enable required extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ============================================================
-- ACCOUNTS: Stores connected Gmail accounts with encrypted tokens
-- ============================================================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  google_email text unique not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expiry timestamptz,
  gmail_history_id text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- SYNC_JOBS: Tracks sync operations for resumability & monitoring
-- ============================================================
create table if not exists sync_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  type text check (type in ('full','incremental')) not null,
  status text check (status in ('running','completed','failed')) not null default 'running',
  started_at timestamptz default now(),
  completed_at timestamptz,
  error text,
  stats jsonb
);

-- ============================================================
-- THREADS: Gmail threads with AI-generated metadata
-- Category is a single value (not many-to-many) — most emails
-- fit one dominant category cleanly at this scale
-- ============================================================
create table if not exists threads (
  id text primary key,                  -- gmail thread id
  account_id uuid references accounts(id) on delete cascade,
  subject text,
  snippet text,
  participants jsonb default '[]',
  message_count int default 0,
  last_message_at timestamptz,
  category text check (category in
    ('newsletter','job_recruitment','finance','notifications','personal','work_professional','uncategorized')
  ) default 'uncategorized',
  ai_summary text,
  ai_summary_generated_at timestamptz,
  is_unread boolean default false,
  gmail_label_ids text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- MESSAGES: Individual emails with embeddings for RAG
-- fts column gives free-text fallback alongside vector search
-- ============================================================
create table if not exists messages (
  id text primary key,                  -- gmail message id
  thread_id text references threads(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  internal_date timestamptz,
  from_address text,
  to_addresses text[],
  cc_addresses text[],
  subject text,
  snippet text,
  body_text text,
  body_html text,
  message_id_header text,               -- RFC822 Message-ID, needed for threading replies
  in_reply_to_header text,
  references_header text[],
  gmail_label_ids text[],
  category text check (category in
    ('newsletter','job_recruitment','finance','notifications','personal','work_professional','uncategorized')
  ) default 'uncategorized',
  ai_summary text,
  embedding vector(768),
  is_from_user boolean default false,
  fts tsvector generated always as (
    to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body_text,''))
  ) stored,
  created_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists idx_messages_fts on messages using gin (fts);
create index if not exists idx_messages_account_date on messages (account_id, internal_date desc);
create index if not exists idx_messages_thread on messages (thread_id);
create index if not exists idx_threads_account_category on threads (account_id, category);
create index if not exists idx_threads_account_date on threads (account_id, last_message_at desc);

-- Vector index (hnsw for cosine similarity — enable once you have rows)
-- create index if not exists idx_messages_embedding on messages using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- DRAFTS: AI-generated email drafts
-- ============================================================
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  thread_id text references threads(id),
  kind text check (kind in ('new','reply')) not null,
  prompt text,
  subject text,
  body text,
  status text check (status in ('draft','sent','discarded')) default 'draft',
  gmail_draft_id text,
  gmail_message_id text,
  created_at timestamptz default now()
);

-- ============================================================
-- CHAT: Conversations and messages for the AI chat agent
-- ============================================================
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references chat_conversations(id) on delete cascade,
  role text check (role in ('user','assistant')) not null,
  content text not null,
  sources jsonb default '[]',           -- [{message_id, thread_id, subject, from_address}]
  created_at timestamptz default now()
);

-- ============================================================
-- NEWS_ITEMS: Extracted newsletter items for deduplication
-- ============================================================
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  source_message_id text references messages(id),
  source_name text,                     -- newsletter sender/brand
  title text,
  summary text,
  url text,
  published_at timestamptz,
  embedding vector(768),
  cluster_id uuid,                      -- shared id across duplicate items
  created_at timestamptz default now()
);
