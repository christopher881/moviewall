-- MovieWall schema
-- Run this in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- =========================================================
-- Tables
-- =========================================================

create table if not exists posters (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  year          text,
  rating        text,
  runtime       text,
  genre         text,
  description   text,
  image_url     text not null,
  storage_path  text,
  active        boolean default true,
  created_at    timestamp with time zone default now()
);

create table if not exists collections (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  active        boolean default true,
  created_at    timestamp with time zone default now()
);

create table if not exists collection_posters (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid references collections(id) on delete cascade,
  poster_id     uuid references posters(id) on delete cascade,
  sort_order    integer default 0,
  created_at    timestamp with time zone default now()
);

create table if not exists displays (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  location            text,
  active_collection_id uuid references collections(id),
  active_poster_id    uuid references posters(id),
  display_mode        text default 'collection',
  rotation_seconds    integer default 30,
  fit_mode            text default 'cover',
  transition_style    text default 'fade',
  show_overlay        boolean default false,
  sleep_enabled       boolean default false,
  sleep_time          text,
  wake_time           text,
  is_online           boolean default false,
  last_seen           timestamp with time zone,
  created_at          timestamp with time zone default now()
);

create table if not exists schedules (
  id            uuid primary key default gen_random_uuid(),
  display_id    uuid references displays(id) on delete cascade,
  collection_id uuid references collections(id),
  poster_id     uuid references posters(id),
  name          text not null,
  schedule_type text,
  day_of_week   text,
  start_time    text,
  end_time      text,
  start_date    date,
  end_date      date,
  active        boolean default true,
  created_at    timestamp with time zone default now()
);

-- Helpful indexes
create index if not exists idx_collection_posters_collection on collection_posters(collection_id, sort_order);
create index if not exists idx_collection_posters_poster on collection_posters(poster_id);
create index if not exists idx_schedules_display on schedules(display_id);

-- =========================================================
-- Storage bucket (movie-posters)
-- =========================================================

insert into storage.buckets (id, name, public)
values ('movie-posters', 'movie-posters', true)
on conflict (id) do nothing;

-- Permissive storage policies for V1 (no admin auth).
-- Tighten these if you add auth later.
drop policy if exists "movie-posters public read"  on storage.objects;
drop policy if exists "movie-posters anon write"   on storage.objects;
drop policy if exists "movie-posters anon update"  on storage.objects;
drop policy if exists "movie-posters anon delete"  on storage.objects;

create policy "movie-posters public read"
  on storage.objects for select
  using (bucket_id = 'movie-posters');

create policy "movie-posters anon write"
  on storage.objects for insert
  with check (bucket_id = 'movie-posters');

create policy "movie-posters anon update"
  on storage.objects for update
  using (bucket_id = 'movie-posters');

create policy "movie-posters anon delete"
  on storage.objects for delete
  using (bucket_id = 'movie-posters');

-- =========================================================
-- Row Level Security
-- =========================================================
-- V1: no admin auth; anon role is allowed full access so the
-- app works out of the box. Restrict this once you add auth.

alter table posters             enable row level security;
alter table collections         enable row level security;
alter table collection_posters  enable row level security;
alter table displays            enable row level security;
alter table schedules           enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array['posters','collections','collection_posters','displays','schedules'])
  loop
    execute format('drop policy if exists "%1$s anon all" on %1$s', t);
    execute format(
      'create policy "%1$s anon all" on %1$s for all using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- =========================================================
-- Realtime
-- =========================================================
-- Make sure these tables broadcast changes to subscribed clients.

do $$
declare
  t text;
begin
  for t in
    select unnest(array['posters','collections','collection_posters','displays','schedules'])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
