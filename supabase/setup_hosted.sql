-- =============================================================
-- ScanDine — FULL HOSTED SETUP (generated; do not edit by hand)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Source of truth = supabase/migrations/*.sql + supabase/seed.sql
-- =============================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: supabase/migrations/20260605120000_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: supabase/migrations/20260605120100_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- ScanDine — 002 Row Level Security (the tenant-isolation crown jewel)
--
-- Model:
--   * RLS on every table. Default-deny: a table with no matching policy for a
--     role returns nothing for that role.
--   * Two SECURITY DEFINER helpers read the caller's tenant/role from profiles
--     (definer rights avoid infinite RLS recursion on profiles itself).
--   * anon may SELECT low-sensitivity, non-PII rows (menus, order status) so the
--     customer PWA + Realtime work. anon may NEVER write, and NEVER read
--     `tables` (qr_token is a capability secret), `bills`, `profiles`, or
--     `super_admin_sessions`.
--   * All customer mutations go through SECURITY DEFINER RPCs (migration 003)
--     that validate the qr_token internally — not through table grants.
--   * Super admin uses the service-role key (bypasses RLS) server-side only.
-- ============================================================================

-- ---- Tenant/role helpers ---------------------------------------------------

create or replace function public.auth_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select restaurant_id from public.profiles where id = (select auth.uid());
$$;

create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

grant execute on function public.auth_restaurant_id() to anon, authenticated;
grant execute on function public.auth_role() to anon, authenticated;

-- ---- Base privileges (RLS is the fine gate; these are the coarse gate) ------

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- ---- Enable RLS everywhere -------------------------------------------------

alter table public.restaurants          enable row level security;
alter table public.profiles             enable row level security;
alter table public.tables               enable row level security;
alter table public.menu_categories      enable row level security;
alter table public.menu_items           enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.bills                enable row level security;
alter table public.ratings              enable row level security;
alter table public.super_admin_sessions enable row level security;

-- ===========================================================================
-- restaurants
-- ===========================================================================
create policy restaurants_anon_select on public.restaurants
  for select to anon using (is_active = true);

create policy restaurants_member_select on public.restaurants
  for select to authenticated using (id = public.auth_restaurant_id());

create policy restaurants_admin_update on public.restaurants
  for update to authenticated
  using (id = public.auth_restaurant_id() and public.auth_role() = 'admin')
  with check (id = public.auth_restaurant_id() and public.auth_role() = 'admin');

-- ===========================================================================
-- profiles  (own row always; admins see/manage their restaurant's staff)
-- ===========================================================================
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or (public.auth_role() = 'admin' and restaurant_id = public.auth_restaurant_id())
  );

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.auth_role() = 'admin' and restaurant_id = public.auth_restaurant_id())
  with check (restaurant_id = public.auth_restaurant_id());

-- ===========================================================================
-- tables  (NO anon — qr_token is a secret. Members read; admins manage.)
-- ===========================================================================
create policy tables_member_select on public.tables
  for select to authenticated using (restaurant_id = public.auth_restaurant_id());

create policy tables_admin_insert on public.tables
  for insert to authenticated
  with check (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin');

create policy tables_admin_update on public.tables
  for update to authenticated
  using (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin')
  with check (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin');

create policy tables_admin_delete on public.tables
  for delete to authenticated
  using (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin');

-- ===========================================================================
-- menu_categories
-- ===========================================================================
create policy menu_categories_anon_select on public.menu_categories
  for select to anon using (
    is_visible = true
    and exists (
      select 1 from public.restaurants r
      where r.id = menu_categories.restaurant_id and r.is_active
    )
  );

create policy menu_categories_member_select on public.menu_categories
  for select to authenticated using (restaurant_id = public.auth_restaurant_id());

create policy menu_categories_admin_write on public.menu_categories
  for all to authenticated
  using (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin')
  with check (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin');

-- ===========================================================================
-- menu_items
-- ===========================================================================
create policy menu_items_anon_select on public.menu_items
  for select to anon using (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_items.restaurant_id and r.is_active
    )
  );

create policy menu_items_member_select on public.menu_items
  for select to authenticated using (restaurant_id = public.auth_restaurant_id());

create policy menu_items_admin_write on public.menu_items
  for all to authenticated
  using (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin')
  with check (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin');

-- ===========================================================================
-- orders  (anon reads live status; members manage their restaurant's orders.
--          Inserts happen only via the place_order RPC, never directly.)
-- ===========================================================================
create policy orders_anon_select on public.orders
  for select to anon using (
    exists (
      select 1 from public.restaurants r
      where r.id = orders.restaurant_id and r.is_active
    )
  );

create policy orders_member_select on public.orders
  for select to authenticated using (restaurant_id = public.auth_restaurant_id());

create policy orders_member_update on public.orders
  for update to authenticated
  using (restaurant_id = public.auth_restaurant_id())
  with check (restaurant_id = public.auth_restaurant_id());

-- ===========================================================================
-- order_items  (tenant derived from the parent order)
-- ===========================================================================
create policy order_items_anon_select on public.order_items
  for select to anon using (
    exists (
      select 1
      from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = order_items.order_id and r.is_active
    )
  );

create policy order_items_member_select on public.order_items
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.restaurant_id = public.auth_restaurant_id()
    )
  );

create policy order_items_member_update on public.order_items
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.restaurant_id = public.auth_restaurant_id()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.restaurant_id = public.auth_restaurant_id()
    )
  );

-- ===========================================================================
-- bills  (NO anon — customers read their bill via an RPC. Members read;
--         admins confirm payment via UPDATE. Inserts via generate_bill RPC.)
-- ===========================================================================
create policy bills_member_select on public.bills
  for select to authenticated using (restaurant_id = public.auth_restaurant_id());

create policy bills_admin_update on public.bills
  for update to authenticated
  using (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin')
  with check (restaurant_id = public.auth_restaurant_id() and public.auth_role() = 'admin');

-- ===========================================================================
-- ratings  (admins read their restaurant's ratings; writes via future RPC)
-- ===========================================================================
create policy ratings_member_select on public.ratings
  for select to authenticated using (restaurant_id = public.auth_restaurant_id());

-- super_admin_sessions: RLS enabled, no policies => service-role only.

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: supabase/migrations/20260605120200_functions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- ScanDine — 003 RPCs (SECURITY DEFINER)
--
-- These are the ONLY way anonymous customers change data. Each validates the
-- qr_token (and active restaurant / business rules) internally, then performs
-- the write atomically. Prices are looked up server-side from menu_items, never
-- trusted from the client. search_path is pinned to '' and every object is
-- schema-qualified to prevent search-path hijacking.
--
-- EXECUTE is revoked from PUBLIC and granted explicitly at the bottom so the
-- internal helper can't be called directly with a forged restaurant_id.
-- ============================================================================

-- ---- internal: snapshot + insert order items -------------------------------
-- Not granted to anyone; only the validated wrapper RPCs (same owner) call it.
create or replace function public._insert_order_items(
  p_order_id uuid,
  p_restaurant_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item        jsonb;
  v_menu        public.menu_items;
  v_qty         integer;
  v_unit        numeric(10, 2);
  v_variant_sel jsonb;
  v_addon_sel   jsonb;
  v_variant_nm  text;
  v_addon_nm    text;
  v_match       jsonb;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'No items provided' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 then
      raise exception 'Invalid quantity' using errcode = '22023';
    end if;

    select m.* into v_menu
    from public.menu_items m
    where m.id = (v_item->>'menu_item_id')::uuid
      and m.restaurant_id = p_restaurant_id;

    if v_menu.id is null then
      raise exception 'Menu item not found' using errcode = 'P0002';
    end if;
    if not v_menu.is_available then
      raise exception 'Item "%" is currently unavailable', v_menu.name
        using errcode = 'P0001';
    end if;

    v_unit := v_menu.price;

    -- Variant: look up authoritative price_delta by name.
    v_variant_sel := null;
    v_variant_nm  := nullif(v_item->>'variant', '');
    if v_variant_nm is not null then
      select elem into v_match
      from jsonb_array_elements(v_menu.variants) elem
      where elem->>'name' = v_variant_nm
      limit 1;
      if v_match is null then
        raise exception 'Invalid variant "%"', v_variant_nm using errcode = '22023';
      end if;
      v_unit := v_unit + coalesce((v_match->>'price_delta')::numeric, 0);
      v_variant_sel := jsonb_build_object(
        'name', v_match->>'name',
        'price_delta', coalesce((v_match->>'price_delta')::numeric, 0)
      );
    end if;

    -- Add-ons: array of names; look up authoritative price for each.
    v_addon_sel := '[]'::jsonb;
    if jsonb_typeof(coalesce(v_item->'addons', '[]'::jsonb)) = 'array' then
      for v_addon_nm in
        select value from jsonb_array_elements_text(coalesce(v_item->'addons', '[]'::jsonb))
      loop
        select elem into v_match
        from jsonb_array_elements(v_menu.addons) elem
        where elem->>'name' = v_addon_nm
        limit 1;
        if v_match is null then
          raise exception 'Invalid add-on "%"', v_addon_nm using errcode = '22023';
        end if;
        v_unit := v_unit + coalesce((v_match->>'price')::numeric, 0);
        v_addon_sel := v_addon_sel || jsonb_build_object(
          'name', v_match->>'name',
          'price', coalesce((v_match->>'price')::numeric, 0)
        );
      end loop;
    end if;

    insert into public.order_items
      (order_id, menu_item_id, name_snapshot, quantity, unit_price, addons, variant, item_note)
    values
      (p_order_id, v_menu.id, v_menu.name, v_qty, v_unit, v_addon_sel, v_variant_sel,
       nullif(trim(coalesce(v_item->>'item_note', '')), ''));
  end loop;
end;
$$;

-- ---- resolve_table: the customer's single load call ------------------------
create or replace function public.resolve_table(p_qr_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table      public.tables;
  v_restaurant public.restaurants;
  v_order      public.orders;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;

  select r.* into v_restaurant from public.restaurants r where r.id = v_table.restaurant_id;
  if not v_restaurant.is_active then
    raise exception 'This restaurant is not currently active' using errcode = 'P0001';
  end if;

  select o.* into v_order
  from public.orders o
  where o.table_id = v_table.id and o.status <> 'cleared'
  order by o.placed_at desc
  limit 1;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'slug', v_restaurant.slug,
      'address', v_restaurant.address,
      'google_review_url', v_restaurant.google_review_url,
      'tax_config', v_restaurant.tax_config
    ),
    'table', jsonb_build_object(
      'id', v_table.id,
      'table_number', v_table.table_number,
      'capacity', v_table.capacity,
      'status', v_table.status
    ),
    'menu', (
      select coalesce(jsonb_agg(c.cat order by c.cat_sort, c.cat_name), '[]'::jsonb)
      from (
        select
          mc.sort_order as cat_sort,
          mc.name       as cat_name,
          jsonb_build_object(
            'id', mc.id,
            'name', mc.name,
            'sort_order', mc.sort_order,
            'items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', mi.id,
                  'name', mi.name,
                  'description', mi.description,
                  'price', mi.price,
                  'image_url', mi.image_url,
                  'is_veg', mi.is_veg,
                  'is_available', mi.is_available,
                  'addons', mi.addons,
                  'variants', mi.variants,
                  'sort_order', mi.sort_order
                ) order by mi.sort_order, mi.name
              )
              from public.menu_items mi
              where mi.category_id = mc.id
            ), '[]'::jsonb)
          ) as cat
        from public.menu_categories mc
        where mc.restaurant_id = v_restaurant.id and mc.is_visible
      ) c
    ),
    'active_order', case
      when v_order.id is null then null
      else jsonb_build_object(
        'id', v_order.id,
        'status', v_order.status,
        'table_note', v_order.table_note,
        'placed_at', v_order.placed_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', oi.id,
            'name', oi.name_snapshot,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'addons', oi.addons,
            'variant', oi.variant,
            'item_note', oi.item_note,
            'status', oi.status
          ) order by oi.created_at)
          from public.order_items oi where oi.order_id = v_order.id
        ), '[]'::jsonb)
      )
    end
  );
end;
$$;

-- ---- place_order: create the first order for a table -----------------------
create or replace function public.place_order(
  p_qr_token text,
  p_items jsonb,
  p_table_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table      public.tables;
  v_restaurant public.restaurants;
  v_order_id   uuid;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;

  select r.* into v_restaurant from public.restaurants r where r.id = v_table.restaurant_id;
  if not v_restaurant.is_active then
    raise exception 'This restaurant is not currently active' using errcode = 'P0001';
  end if;

  -- Business rule: one active order per table.
  if exists (
    select 1 from public.orders o
    where o.table_id = v_table.id and o.status <> 'cleared'
  ) then
    raise exception 'This table already has an active order'
      using errcode = '23505';
  end if;

  insert into public.orders (restaurant_id, table_id, status, table_note)
  values (
    v_restaurant.id, v_table.id, 'placed',
    nullif(trim(coalesce(p_table_note, '')), '')
  )
  returning id into v_order_id;

  perform public._insert_order_items(v_order_id, v_restaurant.id, p_items);

  update public.tables set status = 'occupied' where id = v_table.id;

  return v_order_id;
end;
$$;

-- ---- add_items_to_order: append before the order is READY ------------------
create or replace function public.add_items_to_order(
  p_qr_token text,
  p_order_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.tables;
  v_order public.orders;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id and o.table_id = v_table.id;
  if v_order.id is null then
    raise exception 'Order not found for this table' using errcode = 'P0002';
  end if;
  if v_order.status not in ('placed', 'accepted', 'cooking') then
    raise exception 'This order can no longer be changed' using errcode = 'P0001';
  end if;

  perform public._insert_order_items(p_order_id, v_table.restaurant_id, p_items);

  return p_order_id;
end;
$$;

-- ---- request_bill: customer flags the table for billing --------------------
create or replace function public.request_bill(p_qr_token text, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.tables;
  v_order public.orders;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id and o.table_id = v_table.id and o.status <> 'cleared';
  if v_order.id is null then
    raise exception 'No active order for this table' using errcode = 'P0002';
  end if;

  update public.tables set status = 'billing' where id = v_table.id;
end;
$$;

-- ---- get_bill: customer reads their own bill (bills are not anon-readable) --
create or replace function public.get_bill(p_qr_token text, p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table public.tables;
  v_bill  public.bills;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.table_id = v_table.id
  ) then
    raise exception 'Order not found for this table' using errcode = 'P0002';
  end if;

  select b.* into v_bill from public.bills b where b.order_id = p_order_id;
  if v_bill.id is null then
    return null; -- bill not generated yet
  end if;

  return jsonb_build_object(
    'id', v_bill.id,
    'subtotal', v_bill.subtotal,
    'sgst', v_bill.sgst,
    'cgst', v_bill.cgst,
    'discount', v_bill.discount,
    'total', v_bill.total,
    'payment_method', v_bill.payment_method,
    'paid_at', v_bill.paid_at
  );
end;
$$;

-- ===========================================================================
-- Staff/admin RPCs — authenticated, with internal tenant authorisation
-- (SECURITY DEFINER bypasses RLS, so we re-check the caller's restaurant/role).
-- ===========================================================================

-- ---- generate_bill: exact GST math, one source of truth --------------------
-- GST is computed on the gross subtotal (CONTEXT §13 / CLAUDE.md §9), then the
-- discount is subtracted from the total.
create or replace function public.generate_bill(
  p_order_id uuid,
  p_discount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller     uuid := public.auth_restaurant_id();
  v_order      public.orders;
  v_restaurant public.restaurants;
  v_subtotal   numeric(10, 2);
  v_sgst       numeric(10, 2);
  v_cgst       numeric(10, 2);
  v_total      numeric(10, 2);
  v_discount   numeric(10, 2);
  v_bill       public.bills;
begin
  if v_caller is null then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.restaurant_id <> v_caller then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select r.* into v_restaurant from public.restaurants r where r.id = v_order.restaurant_id;

  select coalesce(sum(oi.unit_price * oi.quantity), 0)
    into v_subtotal
  from public.order_items oi
  where oi.order_id = p_order_id;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  v_sgst := round(v_subtotal * coalesce((v_restaurant.tax_config->>'sgst')::numeric, 0) / 100, 2);
  v_cgst := round(v_subtotal * coalesce((v_restaurant.tax_config->>'cgst')::numeric, 0) / 100, 2);
  v_total := v_subtotal + v_sgst + v_cgst - v_discount;

  insert into public.bills
    (order_id, restaurant_id, subtotal, sgst, cgst, discount, total)
  values
    (p_order_id, v_order.restaurant_id, v_subtotal, v_sgst, v_cgst, v_discount, v_total)
  on conflict (order_id) do update set
    subtotal   = excluded.subtotal,
    sgst       = excluded.sgst,
    cgst       = excluded.cgst,
    discount   = excluded.discount,
    total      = excluded.total,
    updated_at = now()
  returning * into v_bill;

  update public.orders
    set status = 'billed', billed_at = coalesce(billed_at, now())
  where id = p_order_id;
  update public.tables set status = 'billing' where id = v_order.table_id;

  return jsonb_build_object(
    'id', v_bill.id,
    'order_id', v_bill.order_id,
    'subtotal', v_bill.subtotal,
    'sgst', v_bill.sgst,
    'cgst', v_bill.cgst,
    'discount', v_bill.discount,
    'total', v_bill.total,
    'payment_method', v_bill.payment_method,
    'paid_at', v_bill.paid_at
  );
end;
$$;

-- ---- clear_table: only after payment; regenerates the qr_token -------------
create or replace function public.clear_table(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller    uuid := public.auth_restaurant_id();
  v_role      public.user_role := public.auth_role();
  v_order     public.orders;
  v_bill      public.bills;
  v_new_token text;
begin
  if v_caller is null or v_role <> 'admin' then
    raise exception 'Only an admin can clear a table' using errcode = '42501';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.restaurant_id <> v_caller then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select b.* into v_bill from public.bills b where b.order_id = p_order_id;
  if v_bill.id is null then
    raise exception 'Generate the bill before clearing the table' using errcode = 'P0001';
  end if;
  if v_bill.payment_method = 'pending' or v_bill.paid_at is null then
    raise exception 'Confirm payment before clearing the table' using errcode = 'P0001';
  end if;

  v_new_token := public.new_qr_token();
  update public.orders set status = 'cleared' where id = p_order_id;
  update public.tables
    set status = 'empty', qr_token = v_new_token
  where id = v_order.table_id;

  return v_new_token;
end;
$$;

-- ---- Lock down EXECUTE: revoke PUBLIC default, grant explicitly ------------
revoke execute on function public._insert_order_items(uuid, uuid, jsonb) from public;
revoke execute on function public.resolve_table(text) from public;
revoke execute on function public.place_order(text, jsonb, text) from public;
revoke execute on function public.add_items_to_order(text, uuid, jsonb) from public;
revoke execute on function public.request_bill(text, uuid) from public;
revoke execute on function public.get_bill(text, uuid) from public;
revoke execute on function public.generate_bill(uuid, numeric) from public;
revoke execute on function public.clear_table(uuid) from public;

-- Customer (anonymous) RPCs:
grant execute on function public.resolve_table(text)               to anon, authenticated;
grant execute on function public.place_order(text, jsonb, text)    to anon, authenticated;
grant execute on function public.add_items_to_order(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.request_bill(text, uuid)          to anon, authenticated;
grant execute on function public.get_bill(text, uuid)              to anon, authenticated;

-- Staff/admin RPCs:
grant execute on function public.generate_bill(uuid, numeric) to authenticated;
grant execute on function public.clear_table(uuid)            to authenticated;

-- _insert_order_items intentionally granted to no one (internal helper).

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: supabase/migrations/20260605120300_realtime.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- ScanDine — 004 Realtime
-- Add the live tables to Supabase's realtime publication so postgres_changes
-- streams to subscribed clients (RLS still applies to what each client sees):
--   * customer phone  → orders, order_items (their status timeline)
--   * KDS             → orders, order_items (new tickets, per-item status)
--   * admin floor     → tables, orders, bills
--   * availability    → menu_items (live sold-out toggle, Tier 2)
-- REPLICA IDENTITY FULL so filters/old-values work on UPDATE/DELETE events.
-- ============================================================================

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.tables;
alter publication supabase_realtime add table public.bills;
alter publication supabase_realtime add table public.menu_items;

alter table public.orders      replica identity full;
alter table public.order_items replica identity full;
alter table public.tables      replica identity full;
alter table public.bills       replica identity full;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: supabase/seed.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- ScanDine — seed: one demo restaurant so every surface has real data to show.
-- Idempotent: deletes the demo tenant first (cascades), then re-creates it.
-- Run after migrations. Table T1's qr_token = 'demo' → /order/demo works.
-- NOTE: this seeds tenant data only. Admin/staff *auth* users are created via
-- the Super Admin portal (step 3), not here.
-- ============================================================================

delete from public.restaurants where slug = 'friends-fries-cafe';

-- ---- restaurant ------------------------------------------------------------
insert into public.restaurants
  (id, name, slug, gst_number, address, google_review_url, tax_config,
   subscription_plan, pos_mode, is_active, onboarded_by, onboarded_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'Friends & Fries Café',
  'friends-fries-cafe',
  '29ABCDE1234F1Z5',
  '14, MG Road, Indiranagar, Bengaluru 560038',
  'https://search.google.com/local/writereview?placeid=DEMO_PLACE_ID',
  '{"sgst": 2.5, "cgst": 2.5}'::jsonb,
  'free', 'standalone', true, 'Krishna', now()
);

-- ---- tables (T1 token is the well-known demo token) ------------------------
insert into public.tables (restaurant_id, table_number, qr_token, capacity) values
  ('11111111-1111-1111-1111-111111111111', 'T1', 'demo',      4),
  ('11111111-1111-1111-1111-111111111111', 'T2', 'demo-t2',   2),
  ('11111111-1111-1111-1111-111111111111', 'T3', 'demo-t3',   4),
  ('11111111-1111-1111-1111-111111111111', 'T4', 'demo-t4',   6),
  ('11111111-1111-1111-1111-111111111111', 'T5', 'demo-t5',   2),
  ('11111111-1111-1111-1111-111111111111', 'T6', 'demo-t6',   4);

-- ---- categories ------------------------------------------------------------
insert into public.menu_categories (id, restaurant_id, name, sort_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Coffee & Chai',     1),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Brownies & Bakes',  2),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'All-Day Bites',     3),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Coolers',           4);

-- ---- menu items ------------------------------------------------------------
insert into public.menu_items
  (restaurant_id, category_id, name, description, price, is_veg, is_available, addons, variants, sort_order)
values
  -- Coffee & Chai
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Kullad Masala Chai', 'Slow-brewed, served in a clay cup', 40, true, true,
   '[]'::jsonb,
   '[{"name":"Regular","price_delta":0},{"name":"Large","price_delta":15}]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Filter Coffee', 'South-Indian decoction, frothy and strong', 50, true, true,
   '[{"name":"Extra Shot","price":25}]'::jsonb, '[]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Cappuccino', 'Single-origin, velvety microfoam', 130, true, true,
   '[{"name":"Extra Shot","price":25},{"name":"Oat Milk","price":30}]'::jsonb,
   '[{"name":"Regular","price_delta":0},{"name":"Large","price_delta":40}]'::jsonb, 3),

  -- Brownies & Bakes
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Nutella Brownie', 'Warm, fudgy, OREO crumble on top', 150, true, true,
   '[{"name":"Extra Oreo","price":20},{"name":"Vanilla Scoop","price":40}]'::jsonb,
   '[]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Cinnamon Roll', 'Soft swirl, cream-cheese glaze', 120, true, true,
   '[]'::jsonb, '[]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Choco Chip Cookie', 'Gooey centre, sea-salt finish', 60, true, false,
   '[]'::jsonb, '[]'::jsonb, 3),

  -- All-Day Bites
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Peri-Peri Chicken Club', 'Triple-stack, hand-cut fries on the side', 180, false, true,
   '[{"name":"Add Cheese","price":30},{"name":"Extra Patty","price":60}]'::jsonb,
   '[]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Paneer Tikka Roll', 'Smoky paneer, mint chutney, kachumber', 140, true, true,
   '[{"name":"Add Cheese","price":30}]'::jsonb, '[]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Loaded Cheese Fries', 'Hand-cut, molten cheddar, jalapeños', 160, true, true,
   '[]'::jsonb, '[{"name":"Regular","price_delta":0},{"name":"Sharing","price_delta":70}]'::jsonb, 3),

  -- Coolers
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Cold Coffee', 'Thick, blended, dark-chocolate drizzle', 120, true, true,
   '[{"name":"Extra Shot","price":25},{"name":"Ice Cream Float","price":40}]'::jsonb,
   '[]'::jsonb, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Fresh Lime Soda', 'Sweet, salt or mixed — your call', 70, true, true,
   '[]'::jsonb,
   '[{"name":"Sweet","price_delta":0},{"name":"Salted","price_delta":0},{"name":"Mixed","price_delta":0}]'::jsonb, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Virgin Mojito', 'Muddled mint, lime, soda', 110, true, true,
   '[]'::jsonb, '[]'::jsonb, 3);
