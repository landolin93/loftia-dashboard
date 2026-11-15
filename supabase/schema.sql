-- Loftia Dashboard database. Paste this whole file into Supabase > SQL Editor and press Run.
-- Safe to run again: it only creates what's missing.

-- Your item counts
create table if not exists public.inventory (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  item_key   text not null,
  have       integer not null default 0 check (have >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- Bins you marked done, and exactly what was taken out of your bag (so Undo can put it back)
create table if not exists public.completions (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        text not null,
  bin        text not null,
  item_key   text not null,
  removed    integer not null,
  requested  integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, bin, item_key)
);

-- Items logged with "Found..." on the task list
create table if not exists public.finds (
  id       bigint generated always as identity primary key,
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  ts       timestamptz not null default now(),
  item_key text not null,
  qty      integer not null
);

-- Automatic backups (made before every CSV import, or when you press Back up now)
create table if not exists public.backups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  label      text not null,
  data       jsonb not null
);

-- Shared game data (bin requests, recipes, item info). Only the update-requests function writes it.
create table if not exists public.app_data (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists finds_user_ts on public.finds (user_id, ts desc);
create index if not exists backups_user on public.backups (user_id, created_at desc);

-- Privacy: everyone only ever sees their own rows
alter table public.inventory   enable row level security;
alter table public.completions enable row level security;
alter table public.finds       enable row level security;
alter table public.backups     enable row level security;
alter table public.app_data    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['inventory', 'completions', 'finds', 'backups'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_own_rows') then
      execute format('create policy %I on public.%I for all to authenticated
                      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                     t || '_own_rows', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename = 'app_data' and policyname = 'app_data_read') then
    create policy app_data_read on public.app_data for select to authenticated using (true);
  end if;
end $$;

-- ───────── all-or-nothing actions (each runs as one transaction) ─────────

-- Set many counts at once. p_replace = true sets everything not listed to 0 (CSV "Replace").
create or replace function public.set_inventory(p_rows jsonb, p_replace boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_replace then
    update inventory set have = 0, updated_at = now() where user_id = auth.uid();
  end if;
  insert into inventory (user_id, item_key, have, updated_at)
  select auth.uid(), r->>'item_key', greatest(0, (r->>'have')::int), now()
  from jsonb_array_elements(p_rows) r
  on conflict (user_id, item_key) do update set have = excluded.have, updated_at = now();
end $$;

-- Mark a bin done: new counts + what was removed, together.
create or replace function public.complete_bin(p_day text, p_bin text, p_items jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from completions where user_id = auth.uid() and day = p_day and bin = p_bin) then
    raise exception 'This bin is already marked done.';
  end if;
  insert into inventory (user_id, item_key, have, updated_at)
  select auth.uid(), r->>'item_key', greatest(0, (r->>'have')::int), now() from jsonb_array_elements(p_items) r
  on conflict (user_id, item_key) do update set have = excluded.have, updated_at = now();
  insert into completions (user_id, day, bin, item_key, removed, requested)
  select auth.uid(), p_day, p_bin, r->>'item_key', (r->>'removed')::int, (r->>'requested')::int
  from jsonb_array_elements(p_items) r;
end $$;

-- Undo a bin: put back exactly what was taken out.
create or replace function public.undo_bin(p_day text, p_bin text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into inventory (user_id, item_key, have, updated_at)
  select auth.uid(), c.item_key, c.removed, now()
  from completions c where c.user_id = auth.uid() and c.day = p_day and c.bin = p_bin
  on conflict (user_id, item_key) do update set have = inventory.have + excluded.have, updated_at = now();
  delete from completions where user_id = auth.uid() and day = p_day and bin = p_bin;
end $$;

-- Log a find (adds to your count) or undo one.
create or replace function public.log_find(p_item_key text, p_qty int)
returns bigint language plpgsql security invoker set search_path = public as $$
declare new_id bigint;
begin
  insert into inventory (user_id, item_key, have) values (auth.uid(), p_item_key, greatest(0, p_qty))
  on conflict (user_id, item_key) do update set have = inventory.have + p_qty, updated_at = now();
  insert into finds (user_id, item_key, qty) values (auth.uid(), p_item_key, p_qty) returning id into new_id;
  return new_id;
end $$;

create or replace function public.undo_find(p_id bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare f record;
begin
  select * into f from finds where id = p_id and user_id = auth.uid();
  if not found then return; end if;
  update inventory set have = greatest(0, have - f.qty), updated_at = now()
  where user_id = auth.uid() and item_key = f.item_key;
  delete from finds where id = p_id;
end $$;

-- Save a backup of your counts and completed bins.
create or replace function public.make_backup(p_label text)
returns bigint language plpgsql security invoker set search_path = public as $$
declare new_id bigint;
begin
  insert into backups (user_id, label, data) values (auth.uid(), p_label, jsonb_build_object(
    'inventory', coalesce((select jsonb_object_agg(item_key, have) from inventory where user_id = auth.uid()), '{}'::jsonb),
    'completions', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id') from completions c where c.user_id = auth.uid()), '[]'::jsonb)
  )) returning id into new_id;
  -- keep the 30 most recent
  delete from backups where user_id = auth.uid() and id not in
    (select id from backups where user_id = auth.uid() order by created_at desc limit 30);
  return new_id;
end $$;

-- Restore a backup (replaces counts and completed bins).
create or replace function public.restore_backup(p_id bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare b jsonb;
begin
  select data into b from backups where id = p_id and user_id = auth.uid();
  if b is null then raise exception 'Backup not found.'; end if;
  update inventory set have = 0, updated_at = now() where user_id = auth.uid();
  insert into inventory (user_id, item_key, have)
  select auth.uid(), e.key, greatest(0, (e.value)::int) from jsonb_each_text(b->'inventory') e
  on conflict (user_id, item_key) do update set have = excluded.have, updated_at = now();
  if b ? 'completions' then
    delete from completions where user_id = auth.uid();
    insert into completions (user_id, day, bin, item_key, removed, requested)
    select auth.uid(), c->>'day', c->>'bin', c->>'item_key', (c->>'removed')::int, (c->>'requested')::int
    from jsonb_array_elements(b->'completions') c;
  end if;
end $$;
