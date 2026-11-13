-- EvoCalendar schema. Run once in the Supabase SQL editor.
-- RLS is enabled with no policies: only the server (service role key) can read/write.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  zoho_id text unique not null,
  email text,
  name text,
  created_at timestamptz default now()
);
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  email text not null,
  access_token text,
  refresh_token text,
  expires_at bigint,
  caldav text,
  password_enc text,
  created_at timestamptz default now(),
  unique (user_id, provider, email)
);
create table if not exists public.settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  timezone text default 'Asia/Kolkata',
  default_view text default 'Week',
  sync_frequency text default 'Every 5 minutes'
);
alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.settings enable row level security;
