-- ============================================================================
-- ScanDine — 011 Clean session-end on clear (+ fixes a ghost re-claim bug)
--
-- Problem: resolve_* always CLAIMS a fresh session for a free table. So after a
-- table is cleared, a lingering phone's background resolve (with its now-stale
-- token) silently re-claimed the freed table → a ghost session that could lock
-- out the next guest, and phones never cleanly showed "your visit ended".
--
-- Fix: if the caller PRESENTS a session token but the table/seat has no live
-- session (cleared, or 45-min expiry), return { ended: true } and DO NOT claim.
-- Only a brand-new scan (no token) claims a fresh session. Every screen then
-- shows "session ended — scan again", for all phones, and the table stays free.
--
-- Re-emits resolve_table + resolve_food_court_store; preserves every field from
-- migration 009 (video/special/bestseller/avg_rating + menu_item_id). Additive
-- to the JSON (adds an optional `ended`); deploy-coupled (clients read `ended`).
-- ============================================================================

create or replace function public.resolve_table(p_qr_token text, p_session_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_table      public.tables;
  v_restaurant public.restaurants;
  v_order      public.orders;
  v_has_order  boolean;
  v_locked     boolean;
  v_token      text;
  v_bestseller uuid;
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
  order by o.placed_at desc limit 1;
  v_has_order := v_order.id is not null;

  if v_table.session_token is not null
     and (v_has_order or v_table.session_started_at > now() - interval '45 minutes') then
    if p_session_token is not null and p_session_token = v_table.session_token then
      v_token := v_table.session_token;
      if not v_has_order then
        update public.tables set session_started_at = now() where id = v_table.id;
      end if;
    else
      v_locked := true;
    end if;
  else
    -- table free / previous session expired
    if p_session_token is not null then
      -- caller's session has ended (cleared or expired) → don't re-claim
      return jsonb_build_object('ended', true,
        'restaurant', jsonb_build_object('id', v_restaurant.id, 'name', v_restaurant.name),
        'table', jsonb_build_object('table_number', v_table.table_number));
    end if;
    v_token := replace(gen_random_uuid()::text, '-', '');
    update public.tables
      set session_token = v_token, session_started_at = now()
    where id = v_table.id;
  end if;

  if v_locked then
    return jsonb_build_object(
      'locked', true,
      'restaurant', jsonb_build_object('id', v_restaurant.id, 'name', v_restaurant.name),
      'table', jsonb_build_object('table_number', v_table.table_number)
    );
  end if;

  select oi.menu_item_id into v_bestseller
  from public.order_items oi
  join public.orders o2 on o2.id = oi.order_id
  where o2.restaurant_id = v_restaurant.id
    and o2.placed_at > now() - interval '30 days'
    and oi.menu_item_id is not null
  group by oi.menu_item_id
  order by sum(oi.quantity) desc
  limit 1;

  return jsonb_build_object(
    'locked', false,
    'session_token', v_token,
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id, 'name', v_restaurant.name, 'slug', v_restaurant.slug,
      'address', v_restaurant.address, 'google_review_url', v_restaurant.google_review_url,
      'tax_config', v_restaurant.tax_config, 'is_accepting_orders', v_restaurant.is_accepting_orders
    ),
    'table', jsonb_build_object(
      'id', v_table.id, 'table_number', v_table.table_number,
      'capacity', v_table.capacity, 'status', v_table.status
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
                'video_url', mi.video_url, 'is_daily_special', mi.is_daily_special,
                'is_bestseller', (mi.id = v_bestseller),
                'avg_rating', (select round(avg(dr.stars), 1) from public.dish_ratings dr where dr.menu_item_id = mi.id),
                'rating_count', (select count(*) from public.dish_ratings dr where dr.menu_item_id = mi.id),
                'addons', mi.addons, 'variants', mi.variants, 'sort_order', mi.sort_order
              ) order by mi.sort_order, mi.name)
              from public.menu_items mi where mi.category_id = mc.id
            ), '[]'::jsonb)
          ) as cat
        from public.menu_categories mc
        where mc.restaurant_id = v_restaurant.id and mc.is_visible
      ) c
    ),
    'active_order', case when not v_has_order then null else jsonb_build_object(
      'id', v_order.id, 'status', v_order.status, 'table_note', v_order.table_note,
      'placed_at', v_order.placed_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', oi.id, 'name', oi.name_snapshot, 'quantity', oi.quantity,
          'unit_price', oi.unit_price, 'addons', oi.addons, 'variant', oi.variant,
          'item_note', oi.item_note, 'status', oi.status, 'menu_item_id', oi.menu_item_id
        ) order by oi.created_at)
        from public.order_items oi where oi.order_id = v_order.id
      ), '[]'::jsonb)
    ) end
  );
end; $$;

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
  v_bestseller uuid;
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

  if v_mode = 'shared_table' then
    select o.* into v_order from public.orders o
    where o.food_court_table_id = v_fct.id and o.restaurant_id = v_store.id and o.status <> 'cleared'
    order by o.placed_at desc limit 1;
    v_has := v_order.id is not null;

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
      -- seat free / previous session expired
      if p_session_token is not null then
        return jsonb_build_object('ended', true, 'mode', v_mode,
          'food_court', jsonb_build_object('name', v_court.name),
          'access', jsonb_build_object('label', v_fct.label),
          'restaurant', jsonb_build_object('name', v_store.name));
      end if;
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
    if p_session_token is not null then
      select o.* into v_order from public.orders o
      where o.restaurant_id = v_store.id and o.food_court_id = v_court.id
        and o.food_court_table_id is null and o.fc_session_token = p_session_token
        and o.status <> 'cleared'
      order by o.placed_at desc limit 1;
    end if;
    v_has := v_order.id is not null;
    v_session := null;
  end if;

  select oi.menu_item_id into v_bestseller
  from public.order_items oi
  join public.orders o2 on o2.id = oi.order_id
  where o2.restaurant_id = v_store.id
    and o2.placed_at > now() - interval '30 days'
    and oi.menu_item_id is not null
  group by oi.menu_item_id
  order by sum(oi.quantity) desc
  limit 1;

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
                'video_url', mi.video_url, 'is_daily_special', mi.is_daily_special,
                'is_bestseller', (mi.id = v_bestseller),
                'avg_rating', (select round(avg(dr.stars), 1) from public.dish_ratings dr where dr.menu_item_id = mi.id),
                'rating_count', (select count(*) from public.dish_ratings dr where dr.menu_item_id = mi.id),
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
          'item_note', oi.item_note, 'status', oi.status, 'menu_item_id', oi.menu_item_id
        ) order by oi.created_at)
        from public.order_items oi where oi.order_id = v_order.id
      ), '[]'::jsonb)
    ) end
  );
end; $$;
