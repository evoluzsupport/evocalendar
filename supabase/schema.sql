-- OneCalendar schema. Lives in its own Postgres schema ("evocalendar") so it can share a Supabase project with other apps.
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

-- EvoCore AI directory sync (applied to the evocore-ai project). Copies public.users into evocalendar.users so the share picker
-- can list everyone. The app calls it hourly via rpc/sync_evocore_users; people keep their row when they first sign in.
alter table evocalendar.users
  add column if not exists department text, add column if not exists avatar_url text,
  add column if not exists evocore_id uuid unique, add column if not exists is_active boolean not null default true;
create unique index if not exists evocalendar_users_email_key on evocalendar.users (lower(email)) where email is not null;
create or replace function evocalendar.sync_evocore_users() returns integer
language plpgsql security definer set search_path = public, evocalendar as $$
declare n integer;
begin
  update evocalendar.users eu
     set evocore_id = pu.id, name = coalesce(eu.name, pu.full_name), department = pu.department::text,
         avatar_url = pu.avatar_url, is_active = coalesce(pu.is_active, true)
    from public.users pu
   where lower(eu.email) = lower(pu.email) and pu.email not ilike '%.invalid' and eu.evocore_id is null;
  insert into evocalendar.users (zoho_id, email, name, department, avatar_url, evocore_id, is_active)
  select 'evocore:' || pu.id, pu.email, pu.full_name, pu.department::text, pu.avatar_url, pu.id, coalesce(pu.is_active, true)
    from public.users pu where pu.email is not null and pu.email not ilike '%.invalid'
  on conflict (evocore_id) do update
     set email = excluded.email, name = excluded.name, department = excluded.department,
         avatar_url = excluded.avatar_url, is_active = excluded.is_active;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function evocalendar.sync_evocore_users() from public, anon, authenticated;
grant execute on function evocalendar.sync_evocore_users() to service_role;
