-- ============================================================================
-- ScanDine — 008 Food Court RPCs (NEW names only; single-café RPCs untouched)
--
-- The customer scans an ACCESS TOKEN — either a food court's generic/pickup
-- qr_token, or a shared-seat food_court_tables.qr_token. That one token resolves
-- the court (+ the access point + its mode). From there:
--   resolve_food_court(token)            → the store list (no session claimed)
--   resolve_food_court_store(token,slug) → that store's menu + active order
--                                          (shared seat: claims/locks a session)
--   place_food_court_order(...)          → a new order tied to (store, access)
--   add_items_to_fc_order / request_fc_bill / get_fc_bill / clear_fc_order
--
-- Each order carries restaurant_id = the store, so KDS, generate_bill, and the
-- store's admin billing all work with ZERO change. Prices are snapshotted by the
-- reused _insert_order_items. Two fulfillment modes:
--   * pickup       → no shared lock; each order gets its own fc_session_token +
--                    a daily pickup_number. (clear via the normal clear_table works.)
--   * shared_table → per-visit session_token on the seat (like single-café tables);
--                    multiple stores' orders coexist under one session;
--                    clear_fc_order releases the seat only when the last clears.
--
-- All SECURITY DEFINER, search_path='', schema-qualified, EXECUTE revoked from
-- PUBLIC then granted to anon/authenticated. Idempotent (create or replace).
-- ============================================================================

-- ---- helper: reject if a shared seat is locked by a different session -------
create or replace function public._check_fc_session(p_fct public.food_court_tables, p_session_token text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_fct.session_token is not null
     and (p_session_token is null or p_session_token <> p_fct.session_token) then
    raise exception 'This table is in use by someone else' using errcode = 'P0001';
  end if;
end; $$;

-- ---- resolve_food_court(token) → court + access point + store list ----------
-- Accepts a court generic token (mode pickup) or a seat token (mode from the
-- seat). Does NOT claim a session (so a cold load never locks a seat).
create or replace function public.resolve_food_court(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_court public.food_courts;
  v_fct   public.food_court_tables;
  v_mode  public.fc_access_mode;
begin
  select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
  if v_fct.id is not null then
    select c.* into v_court from public.food_courts c where c.id = v_fct.food_court_id;
    v_mode := v_fct.mode;
  else
    select c.* into v_court from public.food_courts c where c.qr_token = p_token;
    v_mode := 'pickup';
  end if;

  if v_court.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;
  if not v_court.is_active then
    raise exception 'This food court is not currently active' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'food_court', jsonb_build_object('id', v_court.id, 'name', v_court.name, 'slug', v_court.slug),
    'access', jsonb_build_object(
      'mode', v_mode,
      'id', v_fct.id,                       -- null for a generic/pickup court token
      'label', coalesce(v_fct.label, 'Pickup'),
      'qr_token', p_token
    ),
    'stores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'slug', r.slug, 'is_accepting_orders', r.is_accepting_orders
      ) order by r.name), '[]'::jsonb)
      from public.restaurants r
      where r.food_court_id = v_court.id and r.is_active
    )
  );
end; $$;

-- ---- resolve_food_court_store(token, store_slug, session?) ------------------
-- Returns the SAME shape as resolve_table (restaurant/menu/active_order) plus
-- mode/food_court/access. For a shared seat: claims/authorizes the seat session
-- (returns {locked:true} to a stranger). For pickup: no lock; an active order is
-- only returned if the caller presents the matching per-order session token.
create or replace function public.resolve_food_court_store(
  p_token text, p_store_slug text, p_session_token text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_court public.food_courts;
  v_fct   public.food_court_tables;
  v_mode  public.fc_access_mode;
  v_store public.restaurants;
  v_order public.orders;
  v_has   boolean;
  v_locked boolean := false;
  v_session text;
begin
  -- entry: seat token or court generic token
  select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
  if v_fct.id is not null then
    select c.* into v_court from public.food_courts c where c.id = v_fct.food_court_id;
    v_mode := v_fct.mode;
  else
    select c.* into v_court from public.food_courts c where c.qr_token = p_token;
    v_mode := 'pickup';
  end if;
  if v_court.id is null then raise exception 'Invalid or expired QR code' using errcode = 'P0002'; end if;
  if not v_court.is_active then raise exception 'This food court is not currently active' using errcode = 'P0001'; end if;

  select r.* into v_store from public.restaurants r
  where r.slug = p_store_slug and r.food_court_id = v_court.id and r.is_active;
  if v_store.id is null then raise exception 'Store not found in this food court' using errcode = 'P0002'; end if;

  if v_mode = 'shared_table' then
    -- find this store's active order at this seat
    select o.* into v_order from public.orders o
    where o.food_court_table_id = v_fct.id and o.restaurant_id = v_store.id and o.status <> 'cleared'
    order by o.placed_at desc limit 1;
    v_has := v_order.id is not null;

    -- claim / authorize the seat session (mirrors resolve_table)
    if v_fct.session_token is not null
       and (exists (select 1 from public.orders o2 where o2.food_court_table_id = v_fct.id and o2.status <> 'cleared')
            or v_fct.session_started_at > now() - interval '45 minutes') then
      if p_session_token is not null and p_session_token = v_fct.session_token then
        v_session := v_fct.session_token;
        update public.food_court_tables set session_started_at = now() where id = v_fct.id;
      else
        v_locked := true;
      end if;
    else
      v_session := replace(gen_random_uuid()::text, '-', '');
      update public.food_court_tables set session_token = v_session, session_started_at = now() where id = v_fct.id;
    end if;

    if v_locked then
      return jsonb_build_object(
        'locked', true, 'mode', v_mode,
        'food_court', jsonb_build_object('name', v_court.name),
        'access', jsonb_build_object('label', v_fct.label),
        'restaurant', jsonb_build_object('name', v_store.name)
      );
    end if;
  else
    -- pickup: only surface an active order if the caller holds its token
    if p_session_token is not null then
      select o.* into v_order from public.orders o
      where o.restaurant_id = v_store.id and o.food_court_id = v_court.id
        and o.food_court_table_id is null and o.fc_session_token = p_session_token
        and o.status <> 'cleared'
      order by o.placed_at desc limit 1;
    end if;
    v_has := v_order.id is not null;
    v_session := null;  -- pickup tokens are minted at place_order, not here
  end if;

  return jsonb_build_object(
    'locked', false,
    'mode', v_mode,
    'session_token', v_session,
    'pickup_number', v_order.pickup_number,
    'food_court', jsonb_build_object('id', v_court.id, 'name', v_court.name, 'slug', v_court.slug),
    'access', jsonb_build_object('id', v_fct.id, 'label', coalesce(v_fct.label, 'Pickup'), 'qr_token', p_token),
    'restaurant', jsonb_build_object(
      'id', v_store.id, 'name', v_store.name, 'slug', v_store.slug,
      'address', v_store.address, 'google_review_url', v_store.google_review_url,
      'tax_config', v_store.tax_config, 'is_accepting_orders', v_store.is_accepting_orders
    ),
    'menu', (
      select coalesce(jsonb_agg(c.cat order by c.cat_sort, c.cat_name), '[]'::jsonb)
      from (
        select mc.sort_order as cat_sort, mc.name as cat_name,
          jsonb_build_object('id', mc.id, 'name', mc.name, 'sort_order', mc.sort_order,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', mi.id, 'name', mi.name, 'description', mi.description, 'price', mi.price,
                'image_url', mi.image_url, 'is_veg', mi.is_veg, 'is_available', mi.is_available,
                'addons', mi.addons, 'variants', mi.variants, 'sort_order', mi.sort_order
              ) order by mi.sort_order, mi.name)
              from public.menu_items mi where mi.category_id = mc.id
            ), '[]'::jsonb)
          ) as cat
        from public.menu_categories mc
        where mc.restaurant_id = v_store.id and mc.is_visible
      ) c
    ),
    'active_order', case when not v_has then null else jsonb_build_object(
      'id', v_order.id, 'status', v_order.status, 'table_note', v_order.table_note,
      'placed_at', v_order.placed_at, 'pickup_number', v_order.pickup_number,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', oi.id, 'name', oi.name_snapshot, 'quantity', oi.quantity,
          'unit_price', oi.unit_price, 'addons', oi.addons, 'variant', oi.variant,
          'item_note', oi.item_note, 'status', oi.status
        ) order by oi.created_at)
        from public.order_items oi where oi.order_id = v_order.id
      ), '[]'::jsonb)
    ) end
  );
end; $$;

-- ---- place_food_court_order(token, store_slug, items, note?, session?) ------
-- Returns { order_id, pickup_number, session_token }. Each order's restaurant_id
-- = the store → it lands on that store's KDS + billing automatically.
create or replace function public.place_food_court_order(
  p_token text, p_store_slug text, p_items jsonb,
  p_table_note text default null, p_session_token text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_court public.food_courts;
  v_fct   public.food_court_tables;
  v_mode  public.fc_access_mode;
  v_store public.restaurants;
  v_order_id uuid;
  v_session text;
  v_pickup int;
begin
  select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
  if v_fct.id is not null then
    select c.* into v_court from public.food_courts c where c.id = v_fct.food_court_id;
    v_mode := v_fct.mode;
  else
    select c.* into v_court from public.food_courts c where c.qr_token = p_token;
    v_mode := 'pickup';
  end if;
  if v_court.id is null then raise exception 'Invalid or expired QR code' using errcode = 'P0002'; end if;
  if not v_court.is_active then raise exception 'This food court is not currently active' using errcode = 'P0001'; end if;

  select r.* into v_store from public.restaurants r
  where r.slug = p_store_slug and r.food_court_id = v_court.id and r.is_active;
  if v_store.id is null then raise exception 'Store not found in this food court' using errcode = 'P0002'; end if;
  if not v_store.is_accepting_orders then
    raise exception 'This store is not accepting orders right now' using errcode = 'P0001';
  end if;

  if v_mode = 'shared_table' then
    perform public._check_fc_session(v_fct, p_session_token);
    if exists (select 1 from public.orders o
               where o.food_court_table_id = v_fct.id and o.restaurant_id = v_store.id and o.status <> 'cleared') then
      raise exception 'You already have an active order at this store' using errcode = '23505';
    end if;
    v_session := coalesce(p_session_token, v_fct.session_token);
    insert into public.orders (restaurant_id, table_id, status, table_note,
                               food_court_id, food_court_table_id, fc_session_token)
    values (v_store.id, null, 'placed', nullif(trim(coalesce(p_table_note,'')),''),
            v_court.id, v_fct.id, v_session)
    returning id into v_order_id;
  else
    -- pickup: mint a per-order session token + a daily counter token
    v_session := replace(gen_random_uuid()::text, '-', '');
    select coalesce(max(o.pickup_number), 0) + 1 into v_pickup
    from public.orders o
    where o.food_court_id = v_court.id and o.food_court_table_id is null
      and o.placed_at >= date_trunc('day', now() at time zone 'Asia/Kolkata');
    insert into public.orders (restaurant_id, table_id, status, table_note,
                               food_court_id, food_court_table_id, pickup_number, fc_session_token)
    values (v_store.id, null, 'placed', nullif(trim(coalesce(p_table_note,'')),''),
            v_court.id, null, v_pickup, v_session)
    returning id into v_order_id;
  end if;

  perform public._insert_order_items(v_order_id, v_store.id, p_items);

  return jsonb_build_object('order_id', v_order_id, 'pickup_number', v_pickup, 'session_token', v_session);
end; $$;

-- ---- internal: validate a caller's session against a food-court order -------
create or replace function public._check_fc_order_session(p_order public.orders, p_session_token text)
returns void language plpgsql stable set search_path = '' as $$
declare v_fct public.food_court_tables;
begin
  if p_order.food_court_table_id is not null then
    select f.* into v_fct from public.food_court_tables f where f.id = p_order.food_court_table_id;
    perform public._check_fc_session(v_fct, p_session_token);
  else
    -- pickup: the order's own token is the secret
    if p_order.fc_session_token is not null
       and (p_session_token is null or p_session_token <> p_order.fc_session_token) then
      raise exception 'This order belongs to someone else' using errcode = 'P0001';
    end if;
  end if;
end; $$;

-- ---- add_items_to_fc_order(order_id, items, session?) -----------------------
create or replace function public.add_items_to_fc_order(
  p_order_id uuid, p_items jsonb, p_session_token text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_store public.restaurants;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id and o.food_court_id is not null;
  if v_order.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform public._check_fc_order_session(v_order, p_session_token);
  if v_order.status not in ('placed','accepted','cooking') then
    raise exception 'This order can no longer be changed' using errcode = 'P0001';
  end if;
  select r.* into v_store from public.restaurants r where r.id = v_order.restaurant_id;
  if not v_store.is_accepting_orders then
    raise exception 'This store is not accepting orders right now' using errcode = 'P0001';
  end if;
  perform public._insert_order_items(p_order_id, v_order.restaurant_id, p_items);
  return p_order_id;
end; $$;

-- ---- request_fc_bill(order_id, session?) -----------------------------------
create or replace function public.request_fc_bill(p_order_id uuid, p_session_token text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id and o.food_court_id is not null and o.status <> 'cleared';
  if v_order.id is null then raise exception 'No active order' using errcode = 'P0002'; end if;
  perform public._check_fc_order_session(v_order, p_session_token);
  update public.orders set bill_requested_at = now() where id = v_order.id;
end; $$;

-- ---- get_fc_bill(order_id, session?) ---------------------------------------
create or replace function public.get_fc_bill(p_order_id uuid, p_session_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_order public.orders; v_bill public.bills;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id and o.food_court_id is not null;
  if v_order.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform public._check_fc_order_session(v_order, p_session_token);
  select b.* into v_bill from public.bills b where b.order_id = p_order_id;
  if v_bill.id is null then return null; end if;
  return jsonb_build_object(
    'id', v_bill.id, 'subtotal', v_bill.subtotal, 'sgst', v_bill.sgst, 'cgst', v_bill.cgst,
    'discount', v_bill.discount, 'total', v_bill.total,
    'payment_method', v_bill.payment_method, 'paid_at', v_bill.paid_at
  );
end; $$;

-- ---- clear_fc_order(order_id) — admin; releases a shared seat only on last --
-- (pickup orders can also be cleared by the normal clear_table, since table_id
-- is null makes its table-release a harmless no-op; this is the shared-aware path.)
create or replace function public.clear_fc_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := public.auth_restaurant_id();
  v_role   public.user_role := public.auth_role();
  v_order  public.orders; v_bill public.bills; v_fct public.food_court_tables; v_remaining int;
begin
  if v_caller is null or v_role <> 'admin' then
    raise exception 'Only an admin can clear an order' using errcode = '42501';
  end if;
  select o.* into v_order from public.orders o where o.id = p_order_id and o.food_court_id is not null;
  if v_order.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order.restaurant_id <> v_caller then raise exception 'Not authorised' using errcode = '42501'; end if;
  select b.* into v_bill from public.bills b where b.order_id = p_order_id;
  if v_bill.id is null then raise exception 'Generate the bill before clearing' using errcode = 'P0001'; end if;
  if v_bill.payment_method = 'pending' or v_bill.paid_at is null then
    raise exception 'Confirm payment before clearing' using errcode = 'P0001';
  end if;

  update public.orders set status = 'cleared' where id = p_order_id;

  -- shared seat: release the session only when no other active order remains
  if v_order.food_court_table_id is not null then
    select f.* into v_fct from public.food_court_tables f where f.id = v_order.food_court_table_id for update;
    select count(*) into v_remaining from public.orders o
    where o.food_court_table_id = v_order.food_court_table_id and o.status <> 'cleared';
    if v_remaining = 0 then
      update public.food_court_tables set session_token = null, session_started_at = null
      where id = v_order.food_court_table_id;
    end if;
  end if;
end; $$;

-- ---- grants ----------------------------------------------------------------
revoke execute on function public.resolve_food_court(text)                      from public;
revoke execute on function public.resolve_food_court_store(text, text, text)    from public;
revoke execute on function public.place_food_court_order(text, text, jsonb, text, text) from public;
revoke execute on function public.add_items_to_fc_order(uuid, jsonb, text)      from public;
revoke execute on function public.request_fc_bill(uuid, text)                   from public;
revoke execute on function public.get_fc_bill(uuid, text)                       from public;
revoke execute on function public.clear_fc_order(uuid)                          from public;

grant execute on function public.resolve_food_court(text)                       to anon, authenticated;
grant execute on function public.resolve_food_court_store(text, text, text)     to anon, authenticated;
grant execute on function public.place_food_court_order(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.add_items_to_fc_order(uuid, jsonb, text)       to anon, authenticated;
grant execute on function public.request_fc_bill(uuid, text)                    to anon, authenticated;
grant execute on function public.get_fc_bill(uuid, text)                        to anon, authenticated;
grant execute on function public.clear_fc_order(uuid)                           to authenticated;
