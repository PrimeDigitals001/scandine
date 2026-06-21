-- ============================================================================
-- ScanDine — 008 Food Court RLS (additive; existing policies untouched)
--
-- food_courts: anon may read an ACTIVE court (the store list is non-PII, mirrors
--   restaurants_anon_select). Members may read courts their restaurant belongs to
--   (for store-side UI). No anon/member writes — the super admin uses the
--   service-role key (which bypasses RLS) to set courts up.
-- food_court_tables: NO anon SELECT (qr_token + session_token are capability
--   secrets, exactly like public.tables). Members read their own court's access
--   points; writes are service-role only. Customers reach access points solely
--   through the SECURITY DEFINER RPCs (migration 008 functions).
--
-- The new orders columns + restaurants.food_court_id are covered by the existing
-- orders/restaurants policies — no change needed there.
-- ============================================================================

alter table public.food_courts        enable row level security;
alter table public.food_court_tables  enable row level security;

-- ---- food_courts -----------------------------------------------------------
create policy food_courts_anon_select on public.food_courts
  for select to anon using (is_active = true);

create policy food_courts_member_select on public.food_courts
  for select to authenticated using (
    exists (
      select 1 from public.restaurants r
      where r.food_court_id = food_courts.id
        and r.id = public.auth_restaurant_id()
    )
  );

-- ---- food_court_tables (no anon; members read their court's access points) --
create policy fct_member_select on public.food_court_tables
  for select to authenticated using (
    exists (
      select 1 from public.restaurants r
      where r.food_court_id = food_court_tables.food_court_id
        and r.id = public.auth_restaurant_id()
    )
  );
-- writes: service-role only (super admin onboarding) => no insert/update/delete policies.
