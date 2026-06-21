-- ============================================================================
-- ScanDine — 008 Food Court mode (ADDITIVE; single-café path stays untouched)
--
-- A food court = one location with many independent STORES. Each store is a
-- normal `restaurants` row (own menu/KDS/staff/GST/billing) linked to a court
-- via a nullable FK — so a restaurant with food_court_id IS NULL behaves exactly
-- like today. A customer scans a court QR → store list → picks a store → orders;
-- they can run SIMULTANEOUS independent orders at multiple stores (each its own
-- bill, each routed to that store's kitchen by restaurant_id). Two fulfillment
-- modes: counter-pickup (token number, no table) and a shared seat (per-visit
-- session lock, like single-café tables).
--
-- This migration is SCHEMA ONLY and backward-compatible: every existing order
-- row passes the new check (table_id set, food-court cols null), and the
-- one-active-order index is recreated with identical single-café semantics.
-- Safe to apply BEFORE the new code deploys (not deploy-coupled).
--
-- Pre-flight (must be 0): select count(*) from public.orders where table_id is null;
-- ============================================================================

-- ---- ensure the QR-token helper exists (live was bootstrapped from a combined
-- setup script that may not have it). create-or-replace is idempotent and
-- matches migration 001's definition exactly. ----------------------------------
create or replace function public.new_qr_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

-- ---- ensure the updated_at trigger helper exists (also missing on live for
-- the same reason). Idempotent; matches migration 001's definition. ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---- enum: access-point fulfillment mode -----------------------------------
create type public.fc_access_mode as enum ('shared_table', 'pickup');

-- ---- food_courts (the location anchor) -------------------------------------
create table public.food_courts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  qr_token    text not null unique default public.new_qr_token(), -- generic/pickup entry sticker
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger set_updated_at before update on public.food_courts
  for each row execute function public.set_updated_at();

-- ---- link a store to a court (nullable => standalone café is unchanged) -----
alter table public.restaurants
  add column if not exists food_court_id uuid references public.food_courts (id) on delete set null;
create index restaurants_food_court_id_idx on public.restaurants (food_court_id);

-- ---- food_court_tables (court-scoped access points; shared seat OR pickup) --
-- qr_token + session_token are capability secrets (NOT anon-readable, like
-- public.tables). Shared seats carry a per-visit session_token; pickup points
-- do not (pickup identity is a per-order token minted at order time).
create table public.food_court_tables (
  id                  uuid primary key default gen_random_uuid(),
  food_court_id       uuid not null references public.food_courts (id) on delete cascade,
  mode                public.fc_access_mode not null,
  label               text not null,                                   -- "Table 12" / "Pickup counter"
  qr_token            text not null unique default public.new_qr_token(),
  capacity            integer not null default 4 check (capacity > 0),
  session_token       text,                                            -- shared_table only
  session_started_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (food_court_id, label)
);
create index fct_food_court_id_idx on public.food_court_tables (food_court_id);
create trigger set_updated_at before update on public.food_court_tables
  for each row execute function public.set_updated_at();

-- ---- orders: additive food-court columns (single-café rows stay valid) ------
-- table_id becomes nullable; a food-court order anchors on food_court_id (+ an
-- optional shared-seat food_court_table_id) instead of a single-café table.
alter table public.orders
  alter column table_id drop not null,
  add column food_court_id        uuid references public.food_courts (id) on delete set null,
  add column food_court_table_id  uuid references public.food_court_tables (id) on delete set null,
  add column pickup_number        integer,   -- human counter token for pickup ("#42")
  add column fc_session_token     text;       -- the session that placed it (audit/auth snapshot)

create index orders_food_court_id_idx       on public.orders (food_court_id);
create index orders_food_court_table_id_idx on public.orders (food_court_table_id);

-- Exactly one ordering context per order. Existing rows (table_id set, fc cols
-- null) pass immediately; food-court rows have table_id null + food_court_id set.
-- restaurant_id stays mandatory (= the store) so KDS/billing/RLS are unchanged.
alter table public.orders add constraint orders_anchor_chk check (
  (table_id is not null and food_court_id is null)
  or
  (table_id is null and food_court_id is not null)
);

-- ---- one-active-order index swap (the ONLY modified existing DB object) -----
-- 2a single-café: identical rule, made explicit with `table_id is not null` so
-- food-court rows (null table_id) never collide here.
drop index if exists public.orders_one_active_per_table;
create unique index orders_one_active_per_table
  on public.orders (table_id)
  where status <> 'cleared' and table_id is not null;

-- 2b shared table: one active order per (seat, store). Same store twice at one
-- seat is blocked → the client adds to the existing order instead.
create unique index orders_one_active_per_fct_store
  on public.orders (food_court_table_id, restaurant_id)
  where status <> 'cleared' and food_court_table_id is not null;

-- 2c pickup: intentionally NO uniqueness — many independent pickup orders allowed.

-- ---- grants (new tables aren't covered by migration 002's blanket grant) ----
-- food_courts: anon may read (store list is non-PII; mirrors restaurants).
grant select on public.food_courts to anon;
grant select, insert, update, delete on public.food_courts to authenticated;
grant all on public.food_courts to service_role;
-- food_court_tables: NO anon grant (capability secret). Customers reach it only
-- via SECURITY DEFINER RPCs (which run with definer rights, bypassing grants).
grant select, insert, update, delete on public.food_court_tables to authenticated;
grant all on public.food_court_tables to service_role;

-- ---- enable RLS now (policies are added in the 008 RLS migration) -----------
-- Turned on here so the tables are never created exposed (default-deny until the
-- RLS migration adds policies). Re-enabling there is idempotent.
alter table public.food_courts        enable row level security;
alter table public.food_court_tables  enable row level security;
