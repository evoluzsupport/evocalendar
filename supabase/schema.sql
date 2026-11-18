-- EvoCalendar schema. Lives in its own Postgres schema ("evocalendar") so it can share a Supabase project with other apps.
-- Run once in the Supabase SQL editor, then expose the schema to the API:
--   Dashboard > Project Settings > API > "Exposed schemas" > add: evocalendar
-- RLS is enabled with no policies: only the server (service role key) can read/write.
create schema if not exists evocalendar;

create table if not exists evocalendar.users (
  id uuid primary key default gen_random_uuid(),
  zoho_id text unique not null,
  email text,
  name text,
  created_at timestamptz default now()
);
create table if not exists evocalendar.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references evocalendar.users(id) on delete cascade,
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
create table if not exists evocalendar.settings (
  user_id uuid primary key references evocalendar.users(id) on delete cascade,
  timezone text default 'Asia/Kolkata',
  default_view text default 'Week',
  sync_frequency text default 'Every 5 minutes'
);
-- Team sharing. recipient is an email, or "@domain.com" for everyone in an organisation.
-- permission: 'details' = full meeting details, 'busy' = only that the person is busy.
create table if not exists evocalendar.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  owner_name text,
  owner_email text not null,
  recipient text not null,
  permission text not null default 'details' check (permission in ('details','busy')),
  accounts_enc text not null,
  created_at timestamptz default now(),
  unique (owner_id, recipient)
);
create index if not exists shares_recipient_idx on evocalendar.shares (recipient);

alter table evocalendar.users enable row level security;
alter table evocalendar.accounts enable row level security;
alter table evocalendar.settings enable row level security;
alter table evocalendar.shares enable row level security;

grant usage on schema evocalendar to service_role;
grant all on all tables in schema evocalendar to service_role;
alter default privileges in schema evocalendar grant all on tables to service_role;
