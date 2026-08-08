-- ============================================================================
-- Rango Social — Supabase schema, RLS, views, triggers & storage (Phase 12)
-- ----------------------------------------------------------------------------
-- Run this once in the Supabase SQL Editor (or via psql). It is written to be
-- re-runnable: tables use CREATE IF NOT EXISTS, policies/triggers/functions are
-- dropped & recreated, so re-running does NOT drop data. (Adding a column later
-- means an explicit ALTER — IF NOT EXISTS won't alter an existing table.)
--
-- IDs are TEXT (not uuid) so the mock fixtures seed cleanly and real auth users
-- (auth.uid() is uuid) map in via id = auth.uid()::text.
-- ============================================================================

create extension if not exists pgcrypto;

-- Convenience: current user id as text (auth.uid() is uuid or null).
create or replace function public.current_uid() returns text
language sql stable as $$ select auth.uid()::text $$;

-- ============================================================================
-- TABLES
-- ============================================================================

create table if not exists public.users (
  id              text primary key default gen_random_uuid()::text,
  username        text unique not null,
  display_name    text not null,
  bio             text,
  avatar_url      text,
  cover_url       text,
  follower_count  int  not null default 0,
  following_count int  not null default 0,
  review_count    int  not null default 0,
  is_verified     bool not null default false,
  influencer_tier text,
  badges          jsonb not null default '[]'::jsonb,
  current_streak  int  not null default 0,
  longest_streak  int  not null default 0,
  preferences     jsonb not null default '{}'::jsonb,
  cpf             text,
  cpf_valid       bool,
  created_at      timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id  text not null references public.users(id) on delete cascade,
  following_id text not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);

create table if not exists public.restaurants (
  id                   text primary key default gen_random_uuid()::text,
  name                 text not null,
  description          text,
  categories           text[] not null default '{}',
  price_range          text not null default '$',
  address              jsonb not null default '{}'::jsonb,
  coordinates          jsonb,
  phone                text,
  website              text,
  opening_hours        jsonb,
  photos               text[] not null default '{}',
  menu_photos          text[] not null default '{}',
  average_overall_score numeric,
  average_metrics      jsonb not null default '{}'::jsonb,
  review_count         int  not null default 0,
  vibe_check_count     int  not null default 0,
  is_open_now          bool,
  illness_reports_90d  int  not null default 0,
  illness_warning      bool not null default false,
  elo_by_cuisine       jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists restaurants_city_idx on public.restaurants ((address->>'city'));

create table if not exists public.reviews (
  id                  text primary key default gen_random_uuid()::text,
  user_id             text not null references public.users(id) on delete cascade,
  restaurant_id       text not null references public.restaurants(id) on delete cascade,
  overall_score       int,
  metrics             jsonb not null default '{}'::jsonb,
  comment             text,
  photos              text[] not null default '{}',
  target_destinations jsonb not null default '[]'::jsonb,
  receipt_photo       text,
  total_spent         numeric,
  party_size          int,
  visit_date          date,
  companions          text[],
  likes               int not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists reviews_restaurant_idx on public.reviews(restaurant_id);
create index if not exists reviews_user_idx on public.reviews(user_id);

create table if not exists public.review_likes (
  review_id text not null references public.reviews(id) on delete cascade,
  user_id   text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.comments (
  id         text primary key default gen_random_uuid()::text,
  review_id  text not null references public.reviews(id) on delete cascade,
  user_id    text not null references public.users(id) on delete cascade,
  text       text not null,
  parent_id  text references public.comments(id) on delete cascade,
  likes      int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists comments_review_idx on public.comments(review_id);

create table if not exists public.vibe_checks (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null references public.users(id) on delete cascade,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  status        text not null,
  note          text,
  photo         text,
  expires_at    timestamptz not null default (now() + interval '4 hours'),
  created_at    timestamptz not null default now()
);
create index if not exists vibe_checks_restaurant_idx on public.vibe_checks(restaurant_id);

create table if not exists public.groups (
  id                text primary key default gen_random_uuid()::text,
  name              text not null,
  description       text,
  cover_url         text,
  admin_id          text not null references public.users(id) on delete cascade,
  admins            text[] not null default '{}',
  is_open           bool not null default true,
  mandatory_metrics text[] not null default '{}',
  created_at        timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  text not null references public.groups(id) on delete cascade,
  user_id   text not null references public.users(id) on delete cascade,
  role      text not null default 'MEMBER',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.custom_lists (
  id             text primary key default gen_random_uuid()::text,
  owner_id       text not null references public.users(id) on delete cascade,
  name           text not null,
  description    text,
  icon_url       text,
  cover_color    text,
  is_public      bool not null default true,
  is_wishlist    bool not null default false,
  collaborators  text[] not null default '{}',
  shared_with    text[] not null default '{}',
  themes         text[] not null default '{}',
  follower_count int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.list_items (
  list_id       text not null references public.custom_lists(id) on delete cascade,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  added_by      text references public.users(id) on delete set null,
  note          text,
  priority      int not null default 1,
  added_at      timestamptz not null default now(),
  primary key (list_id, restaurant_id)
);

create table if not exists public.notifications (
  id                  text primary key default gen_random_uuid()::text,
  user_id             text not null references public.users(id) on delete cascade, -- recipient
  type                text not null,
  actor_id            text references public.users(id) on delete set null,
  target_review_id    text references public.reviews(id) on delete set null,
  target_restaurant_id text references public.restaurants(id) on delete set null,
  target_group_id     text references public.groups(id) on delete set null,
  target_list_id      text references public.custom_lists(id) on delete set null,
  message             text not null,
  is_read             bool not null default false,
  created_at          timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id);

create table if not exists public.stories (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null references public.users(id) on delete cascade,
  restaurant_id text references public.restaurants(id) on delete set null,
  photo_url     text not null,
  caption       text,
  viewers       text[] not null default '{}',
  expires_at    timestamptz not null default (now() + interval '24 hours'),
  created_at    timestamptz not null default now()
);
create index if not exists stories_expires_idx on public.stories(expires_at);
create index if not exists stories_created_idx on public.stories(created_at desc);

-- reporter_user_id is sensitive: never selectable by clients (see RLS + views below).
create table if not exists public.illness_reports (
  id               text primary key default gen_random_uuid()::text,
  restaurant_id    text not null references public.restaurants(id) on delete cascade,
  reporter_user_id text not null references public.users(id) on delete cascade,
  symptom          text not null,
  note             text,
  meal_date        date,
  created_at       timestamptz not null default now()
);
create index if not exists illness_restaurant_idx on public.illness_reports(restaurant_id);

create table if not exists public.restaurant_duels (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null references public.users(id) on delete cascade,
  cuisine    text not null,
  a_id       text not null references public.restaurants(id) on delete cascade,
  b_id       text not null references public.restaurants(id) on delete cascade,
  questions  jsonb not null default '[]'::jsonb,
  winner_id  text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cuisine_elos (
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  cuisine       text not null,
  rating        numeric not null default 1000,
  duels         int not null default 0,
  primary key (restaurant_id, cuisine)
);

create table if not exists public.ai_user_profiles (
  user_id    text primary key references public.users(id) on delete cascade,
  markdown   text not null default '',
  version    int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null references public.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_chat_user_idx on public.ai_chat_messages(user_id);

-- ============================================================================
-- TRIGGERS / FUNCTIONS
-- ============================================================================

-- Create a public.users profile when someone signs up (CPF comes from signUp metadata).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, username, display_name, cpf, cpf_valid)
  values (
    new.id::text,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'cpf',
    (new.raw_user_meta_data->>'cpf_valid')::bool
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep users.follower_count / following_count in sync with the follows table.
-- (RLS only lets a user update their OWN row, so counts must be maintained here.)
create or replace function public.sync_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update public.users set following_count = following_count + 1 where id = new.follower_id;
    update public.users set follower_count  = follower_count  + 1 where id = new.following_id;
  elsif (tg_op = 'DELETE') then
    update public.users set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.users set follower_count  = greatest(follower_count  - 1, 0) where id = old.following_id;
  end if;
  return null;
end $$;

drop trigger if exists on_follow_change on public.follows;
create trigger on_follow_change
  after insert or delete on public.follows
  for each row execute function public.sync_follow_counts();

-- Keep reviews.likes in sync with review_likes.
create or replace function public.sync_review_likes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.reviews set likes = likes + 1 where id = new.review_id;
  elsif tg_op = 'DELETE' then
    update public.reviews set likes = greatest(0, likes - 1) where id = old.review_id;
  end if;
  return null;
end $$;

drop trigger if exists review_likes_sync on public.review_likes;
create trigger review_likes_sync
  after insert or delete on public.review_likes
  for each row execute function public.sync_review_likes();

-- Bump denormalized counters on an app write (kept as RPCs, not triggers, so the
-- seed can preserve the rich fixture counts instead of rebuilding them from rows).
create or replace function public.increment_review_counts(rid text, uid text)
returns void language sql security definer set search_path = public as $$
  update public.restaurants set review_count = review_count + 1 where id = rid;
  update public.users set review_count = review_count + 1 where id = uid;
$$;

create or replace function public.decrement_review_counts(rid text, uid text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is distinct from public.current_uid() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.restaurants set review_count = greatest(0, review_count - 1) where id = rid;
  update public.users set review_count = greatest(0, review_count - 1) where id = uid;
end;
$$;

create or replace function public.increment_vibe_count(rid text)
returns void language sql security definer set search_path = public as $$
  update public.restaurants set vibe_check_count = vibe_check_count + 1 where id = rid;
$$;

-- Recompute a restaurant's public illness aggregate (count over the last 90 days,
-- warning once >= 3). Threshold mirrors domain/logic/illness.ts.
create or replace function public.refresh_restaurant_illness(rid text)
returns void language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(*) into cnt
  from public.illness_reports
  where restaurant_id = rid and created_at > now() - interval '90 days';

  update public.restaurants
  set illness_reports_90d = cnt, illness_warning = (cnt >= 3)
  where id = rid;
end $$;

create or replace function public.on_illness_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_restaurant_illness(new.restaurant_id);
  return new;
end $$;

drop trigger if exists illness_report_aggregate on public.illness_reports;
create trigger illness_report_aggregate
  after insert on public.illness_reports
  for each row execute function public.on_illness_report();

-- Append a viewer to a story (called by non-owners → needs definer rights).
create or replace function public.mark_story_viewed(p_story_id text, p_viewer text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.stories
  set viewers = array_append(viewers, p_viewer)
  where id = p_story_id and not (p_viewer = any(viewers));
end $$;

-- Hard-delete expired ephemeral content (24h stories, 4h vibe checks) so the
-- tables don't grow without bound. Reads already hide expired rows; this just
-- reclaims storage. Invoked by /api/cron/cleanup-expired (Vercel Cron) and/or
-- the optional pg_cron schedule below.
create or replace function public.cleanup_expired_content()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.stories     where expires_at < now();
  delete from public.vibe_checks where expires_at < now();
end $$;

-- OPTIONAL backend-native schedule (independent of Vercel Cron). Requires the
-- pg_cron extension (enable once in the Supabase dashboard → Database → Extensions).
-- Uncomment to run the cleanup every hour:
--   create extension if not exists pg_cron;
--   select cron.schedule('cleanup-expired', '0 * * * *',
--                        $$ select public.cleanup_expired_content() $$);

-- ============================================================================
-- VIEWS (illness privacy — reporter_user_id is NEVER exposed here)
-- ============================================================================

drop view if exists public.public_illness_reports;
create view public.public_illness_reports as
  select id, restaurant_id, symptom, note, meal_date, created_at
  from public.illness_reports;

drop view if exists public.restaurant_illness_summary;
create view public.restaurant_illness_summary as
  select restaurant_id,
         count(*) filter (where created_at > now() - interval '90 days') as reports_90d,
         (count(*) filter (where created_at > now() - interval '90 days') >= 3) as warning
  from public.illness_reports
  group by restaurant_id;

grant select on public.public_illness_reports to anon, authenticated;
grant select on public.restaurant_illness_summary to anon, authenticated;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
-- Pattern: public content is world-readable; writes are restricted to the owner
-- (id/user_id = auth.uid()). illness_reports + ai_* are private. Seeding uses the
-- service_role key, which bypasses RLS entirely.

do $$
declare t text;
begin
  foreach t in array array[
    'users','follows','restaurants','reviews','review_likes','comments',
    'vibe_checks','groups','group_members','custom_lists','list_items',
    'notifications','stories','illness_reports','restaurant_duels',
    'cuisine_elos','ai_user_profiles','ai_chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helper to (re)create a policy.
-- USERS -----------------------------------------------------------------------
drop policy if exists users_read on public.users;
create policy users_read on public.users for select using (true);
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update
  using (id = current_uid()) with check (id = current_uid());
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users for insert
  with check (id = current_uid());

-- FOLLOWS ---------------------------------------------------------------------
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select using (true);
drop policy if exists follows_write on public.follows;
create policy follows_write on public.follows for all
  using (follower_id = current_uid()) with check (follower_id = current_uid());

-- RESTAURANTS (read-only for clients; created via seed/admin) ------------------
drop policy if exists restaurants_read on public.restaurants;
create policy restaurants_read on public.restaurants for select using (true);
drop policy if exists restaurants_write on public.restaurants;
create policy restaurants_write on public.restaurants for all
  using (current_uid() is not null) with check (current_uid() is not null);

-- REVIEWS ---------------------------------------------------------------------
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (true);
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert
  with check (user_id = current_uid());
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update
  using (user_id = current_uid()) with check (user_id = current_uid());
drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews for delete using (user_id = current_uid());

-- REVIEW LIKES ----------------------------------------------------------------
drop policy if exists review_likes_read on public.review_likes;
create policy review_likes_read on public.review_likes for select using (true);
drop policy if exists review_likes_write on public.review_likes;
create policy review_likes_write on public.review_likes for all
  using (user_id = current_uid()) with check (user_id = current_uid());

-- COMMENTS --------------------------------------------------------------------
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (true);
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments for insert
  with check (user_id = current_uid());
drop policy if exists comments_modify_own on public.comments;
create policy comments_modify_own on public.comments for update
  using (user_id = current_uid()) with check (user_id = current_uid());

-- VIBE CHECKS -----------------------------------------------------------------
drop policy if exists vibe_read on public.vibe_checks;
create policy vibe_read on public.vibe_checks for select using (true);
drop policy if exists vibe_insert_own on public.vibe_checks;
create policy vibe_insert_own on public.vibe_checks for insert
  with check (user_id = current_uid());

-- GROUPS ----------------------------------------------------------------------
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select using (true);
drop policy if exists groups_insert_own on public.groups;
create policy groups_insert_own on public.groups for insert
  with check (admin_id = current_uid());
drop policy if exists groups_update_admin on public.groups;
create policy groups_update_admin on public.groups for update
  using (admin_id = current_uid()) with check (admin_id = current_uid());

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members for select using (true);
drop policy if exists group_members_write_self on public.group_members;
create policy group_members_write_self on public.group_members for all
  using (user_id = current_uid()) with check (user_id = current_uid());

-- LISTS -----------------------------------------------------------------------
drop policy if exists lists_read on public.custom_lists;
create policy lists_read on public.custom_lists for select
  using (is_public or owner_id = current_uid() or current_uid() = any(collaborators) or current_uid() = any(shared_with));
drop policy if exists lists_write_own on public.custom_lists;
create policy lists_write_own on public.custom_lists for all
  using (owner_id = current_uid() or current_uid() = any(collaborators))
  with check (owner_id = current_uid() or current_uid() = any(collaborators));

drop policy if exists list_items_read on public.list_items;
create policy list_items_read on public.list_items for select using (true);
drop policy if exists list_items_write on public.list_items;
create policy list_items_write on public.list_items for all
  using (exists (select 1 from public.custom_lists l where l.id = list_id
                 and (l.owner_id = current_uid() or current_uid() = any(l.collaborators))))
  with check (exists (select 1 from public.custom_lists l where l.id = list_id
                 and (l.owner_id = current_uid() or current_uid() = any(l.collaborators))));

-- NOTIFICATIONS (recipient only) ----------------------------------------------
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select
  using (user_id = current_uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update
  using (user_id = current_uid()) with check (user_id = current_uid());

-- STORIES (viewers updated via the security-definer RPC, not direct UPDATE) ----
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select using (true);
drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own on public.stories for insert
  with check (user_id = current_uid());
drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories for delete using (user_id = current_uid());

-- ILLNESS REPORTS (the privacy-critical table) --------------------------------
-- Insert your own report; SELECT only your OWN rows (for the 30-day guard).
-- Everyone else reads counts/symptoms via the views above, which omit the reporter.
drop policy if exists illness_insert_own on public.illness_reports;
create policy illness_insert_own on public.illness_reports for insert
  with check (reporter_user_id = current_uid());
drop policy if exists illness_select_own on public.illness_reports;
create policy illness_select_own on public.illness_reports for select
  using (reporter_user_id = current_uid());

-- DUELS / ELO -----------------------------------------------------------------
drop policy if exists duels_read on public.restaurant_duels;
create policy duels_read on public.restaurant_duels for select using (true);
drop policy if exists duels_insert_own on public.restaurant_duels;
create policy duels_insert_own on public.restaurant_duels for insert
  with check (user_id = current_uid());

drop policy if exists elos_read on public.cuisine_elos;
create policy elos_read on public.cuisine_elos for select using (true);
drop policy if exists elos_write on public.cuisine_elos;
create policy elos_write on public.cuisine_elos for all
  using (current_uid() is not null) with check (current_uid() is not null);

-- AI (private to the owner) ---------------------------------------------------
drop policy if exists ai_profile_own on public.ai_user_profiles;
create policy ai_profile_own on public.ai_user_profiles for all
  using (user_id = current_uid()) with check (user_id = current_uid());
drop policy if exists ai_chat_own on public.ai_chat_messages;
create policy ai_chat_own on public.ai_chat_messages for all
  using (user_id = current_uid()) with check (user_id = current_uid());

-- ============================================================================
-- STORAGE BUCKETS + POLICIES
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('review-photos','review-photos', true),
       ('menu-photos','menu-photos', true),
       ('avatars','avatars', true),
       ('story-photos','story-photos', true)
on conflict (id) do nothing;

-- Public read for all app buckets.
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects for select
  using (bucket_id in ('review-photos','menu-photos','avatars','story-photos'));

-- Authenticated users may write into their own folder: <bucket>/<auth.uid()>/...
drop policy if exists storage_owner_write on storage.objects;
create policy storage_owner_write on storage.objects for insert to authenticated
  with check (
    bucket_id in ('review-photos','menu-photos','avatars','story-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_owner_modify on storage.objects;
create policy storage_owner_modify on storage.objects for update to authenticated
  using ((storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_owner_delete on storage.objects;
create policy storage_owner_delete on storage.objects for delete to authenticated
  using ((storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- REALTIME (vibe checks, stories, notifications)
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.vibe_checks;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.stories;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
