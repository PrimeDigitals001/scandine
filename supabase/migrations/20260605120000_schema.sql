-- ============================================================================
-- ScanDine — 001 schema
-- Multi-tenant dine-in ordering. Every row is owned by a restaurant; isolation
-- is enforced by RLS in migration 002. snake_case columns, UUID PKs, money as
-- numeric(10,2), all timestamps timestamptz (UTC; displayed IST in the app).
-- ============================================================================

-- ---- Helpers ---------------------------------------------------------------

-- URL-safe QR token (32 hex chars). Reused when a table is cleared so old
-- customer sessions die. Core gen_random_uuid() only — no extension needed.
create or replace function public.new_qr_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

-- Keep updated_at honest on every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---- Enums -----------------------------------------------------------------

create type public.user_role         as enum ('admin', 'staff');
create type public.table_status      as enum ('empty', 'occupied', 'billing');
create type public.order_status       as enum
  ('placed', 'accepted', 'cooking', 'ready', 'served', 'billed', 'cleared');
create type public.order_item_status  as enum ('pending', 'cooking', 'ready');
create type public.payment_method     as enum ('cash', 'upi', 'card', 'pending');
create type public.subscription_plan  as enum ('free', 'starter', 'pro');
create type public.pos_mode           as enum ('standalone', 'pos_integrated');

-- ---- restaurants -----------------------------------------------------------

create table public.restaurants (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  gst_number         text,
  address            text,
  google_review_url  text,
  tax_config         jsonb not null default '{"sgst": 2.5, "cgst": 2.5}'::jsonb,
  subscription_plan  public.subscription_plan not null default 'free',
  pos_mode           public.pos_mode not null default 'standalone',
  is_active          boolean not null default true,
  onboarded_by       text,
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---- profiles (maps a Supabase Auth user to a restaurant + role) -----------

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  role           public.user_role not null default 'staff',
  full_name      text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_restaurant_id_idx on public.profiles (restaurant_id);

-- ---- tables (dining tables; qr_token is a capability secret) ----------------

create table public.tables (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  table_number   text not null,
  qr_token       text not null unique default public.new_qr_token(),
  status         public.table_status not null default 'empty',
  capacity       integer not null default 2 check (capacity > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, table_number)
);
create index tables_restaurant_id_idx on public.tables (restaurant_id);

-- ---- menu_categories -------------------------------------------------------

create table public.menu_categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  name           text not null,
  sort_order     integer not null default 0,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index menu_categories_restaurant_id_idx on public.menu_categories (restaurant_id);

-- ---- menu_items ------------------------------------------------------------

create table public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  category_id    uuid references public.menu_categories (id) on delete set null,
  name           text not null,
  description    text,
  price          numeric(10, 2) not null check (price >= 0),
  image_url      text,
  is_veg         boolean not null default true,
  is_available   boolean not null default true,
  addons         jsonb not null default '[]'::jsonb,   -- [{ name, price }]
  variants       jsonb not null default '[]'::jsonb,   -- [{ name, price_delta }]
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index menu_items_restaurant_id_idx on public.menu_items (restaurant_id);
create index menu_items_category_id_idx   on public.menu_items (category_id);

-- ---- orders ----------------------------------------------------------------

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  table_id       uuid not null references public.tables (id) on delete cascade,
  status         public.order_status not null default 'placed',
  table_note     text,
  placed_at      timestamptz not null default now(),
  served_at      timestamptz,
  billed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orders_restaurant_id_idx on public.orders (restaurant_id);
create index orders_table_id_idx      on public.orders (table_id);
create index orders_status_idx        on public.orders (restaurant_id, status);

-- Business rule: a table has at most ONE active order (status <> 'cleared').
create unique index orders_one_active_per_table
  on public.orders (table_id)
  where status <> 'cleared';

-- ---- order_items (unit_price + name are snapshots at order time) ------------

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  menu_item_id   uuid references public.menu_items (id) on delete set null,
  name_snapshot  text not null,
  quantity       integer not null check (quantity > 0),
  unit_price     numeric(10, 2) not null check (unit_price >= 0),
  addons         jsonb not null default '[]'::jsonb,
  variant        jsonb,
  item_note      text,
  status         public.order_item_status not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);

-- ---- bills (restaurant_id denormalised for RLS + billing queries) -----------

create table public.bills (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders (id) on delete cascade,
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  subtotal        numeric(10, 2) not null,
  sgst            numeric(10, 2) not null default 0,
  cgst            numeric(10, 2) not null default 0,
  discount        numeric(10, 2) not null default 0,
  total           numeric(10, 2) not null,
  payment_method  public.payment_method not null default 'pending',
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index bills_restaurant_id_idx on public.bills (restaurant_id);

-- ---- ratings (optional internal rating; Google review is a deep-link) -------

create table public.ratings (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders (id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  stars          integer check (stars between 1 and 5),
  comment        text,
  created_at     timestamptz not null default now()
);
create index ratings_restaurant_id_idx on public.ratings (restaurant_id);

-- ---- super_admin_sessions (audit log; service-role only) -------------------

create table public.super_admin_sessions (
  id          uuid primary key default gen_random_uuid(),
  ip_address  text,
  created_at  timestamptz not null default now()
);

-- ---- updated_at triggers ---------------------------------------------------

create trigger set_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tables
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.menu_categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.order_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.bills
  for each row execute function public.set_updated_at();
