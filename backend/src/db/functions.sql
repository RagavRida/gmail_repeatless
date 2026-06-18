  -- pgvector RPC function for semantic search with optional filters
  -- Used by the RAG chat agent for hybrid retrieval

  create or replace function match_messages(
    query_embedding vector(768),
    match_account_id uuid,
    match_count int default 8,
    category_filter text default null,
    date_from timestamptz default null,
    date_to timestamptz default null
  )
  returns table (
    id text,
    thread_id text,
    subject text,
    snippet text,
    from_address text,
    internal_date timestamptz,
    category text,
    body_text text,
    similarity float
  )
  language sql stable as $$
    select
      m.id,
      m.thread_id,
      m.subject,
      m.snippet,
      m.from_address,
      m.internal_date,
      m.category,
      m.body_text,
      1 - (m.embedding <=> query_embedding) as similarity
    from messages m
    where m.account_id = match_account_id
      and m.embedding is not null
      and (category_filter is null or m.category = category_filter)
      and (date_from is null or m.internal_date >= date_from)
      and (date_to is null or m.internal_date <= date_to)
    order by m.embedding <=> query_embedding
    limit match_count;
  $$;

  -- Full-text search function for hybrid retrieval fallback
  create or replace function search_messages_fts(
    query_text text,
    match_account_id uuid,
    match_count int default 8,
    category_filter text default null,
    date_from timestamptz default null,
    date_to timestamptz default null
  )
  returns table (
    id text,
    thread_id text,
    subject text,
    snippet text,
    from_address text,
    internal_date timestamptz,
    category text,
    body_text text,
    rank float
  )
  language sql stable as $$
    select
      m.id,
      m.thread_id,
      m.subject,
      m.snippet,
      m.from_address,
      m.internal_date,
      m.category,
      m.body_text,
      ts_rank(m.fts, websearch_to_tsquery('english', query_text)) as rank
    from messages m
    where m.account_id = match_account_id
      and m.fts @@ websearch_to_tsquery('english', query_text)
      and (category_filter is null or m.category = category_filter)
      and (date_from is null or m.internal_date >= date_from)
      and (date_to is null or m.internal_date <= date_to)
    order by rank desc
    limit match_count;
  $$;
