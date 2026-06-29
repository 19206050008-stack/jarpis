create extension if not exists vector;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  session_id uuid references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'ai', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists memories (
  id bigserial primary key,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

alter table memories add column if not exists embedding vector(768);

create index if not exists messages_session_created_idx on messages(session_id, created_at);
create index if not exists memories_embedding_idx on memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function match_memories(query_embedding vector(768), match_count int default 5)
returns table (id bigint, content text, similarity float)
language sql stable
as $$
  select memories.id, memories.content, 1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where memories.embedding is not null
  order by memories.embedding <=> query_embedding
  limit match_count;
$$;
