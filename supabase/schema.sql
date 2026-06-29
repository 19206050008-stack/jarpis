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

create index if not exists messages_session_created_idx on messages(session_id, created_at);
