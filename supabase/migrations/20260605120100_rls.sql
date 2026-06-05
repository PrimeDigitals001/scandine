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
