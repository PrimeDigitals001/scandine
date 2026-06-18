-- ============================================================================
-- ScanDine — 007 Per-visit table session lock (decoupled from the QR sticker)
--
-- Problem: the qr_token is a PERMANENT printed sticker, so anyone who ever held
-- the link (a past guest, a leaked URL) could see/modify whoever is at the table
-- now. Fix: keep qr_token permanent, but add a SECOND secret — a per-visit
-- session_token that rotates on every claim and is released when the table is
-- cleared. To view the active order or change it, you need the CURRENT session
-- token. Strangers who scan see "in use"; friends join via a share link that
-- carries the session token.
--
--   * resolve_table(qr_token, session_token?) :
--       - free table  → claims a fresh session_token, returns it
--       - live session + matching token → returns the order (you're in)
--       - live session + wrong/no token  → { locked: true } (in use)
--       - abandoned pre-order claim auto-expires after 45 min
--   * place_order / add_items / request_bill / get_bill require the session token
--   * clear_table releases the session
--
-- Backward-compatible: the session_token params default null; a table with no
-- session yet (null) is grandfathered (operations allowed) so in-flight orders
-- placed before this migration don't brick. Safe to run more than once.
-- ============================================================================

alter table public.tables
  add column if not exists session_token text,
  add column if not exists session_started_at timestamptz;

-- Drop the old (shorter-arity) signatures first. The new versions add a trailing
-- p_session_token; without dropping, a call with the old arg count would be an
-- ambiguous overload (and the un-enforced old body would still be callable).
drop function if exists public.resolve_table(text);
drop function if exists public.place_order(text, jsonb, text);
drop function if exists public.add_items_to_order(text, uuid, jsonb);
drop function if exists public.request_bill(text, uuid);
drop function if exists public.get_bill(text, uuid);

-- resolve_table: claim / authorize / lock, and hand back the session token
create or replace function public.resolve_table(p_qr_token text, p_session_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_table      public.tables;
  v_restaurant public.restaurants;
  v_order      public.orders;
  v_has_order  boolean;
  v_locked     boolean;
  v_token      text;
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

  -- a session is "live" if a token is set AND (there's an order OR it was claimed
  -- recently). An old pre-order claim with no order expires after 45 minutes.
  if v_table.session_token is not null
     and (v_has_order or v_table.session_started_at > now() - interval '45 minutes') then
    if p_session_token is not null and p_session_token = v_table.session_token then
      v_token := v_table.session_token;        -- authorised (claimer or invited friend)
      if not v_has_order then
        update public.tables set session_started_at = now() where id = v_table.id; -- keep-alive
      end if;
    else
      v_locked := true;                         -- someone else is using this table
    end if;
  else
    -- free (or abandoned): claim a fresh session
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
          'item_note', oi.item_note, 'status', oi.status
        ) order by oi.created_at)
        from public.order_items oi where oi.order_id = v_order.id
      ), '[]'::jsonb)
    ) end
  );
end; $$;

-- helper: reject if a session is set and the caller's token doesn't match
-- (null session_token on the table = legacy/no-session → allowed)
create or replace function public._check_session(p_table public.tables, p_session_token text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_table.session_token is not null
     and (p_session_token is null or p_session_token <> p_table.session_token) then
    raise exception 'This table is in use by someone else' using errcode = 'P0001';
  end if;
end; $$;

-- place_order: needs the session token
create or replace function public.place_order(
  p_qr_token text, p_items jsonb, p_table_note text default null, p_session_token text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables; v_restaurant public.restaurants; v_order_id uuid;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;
  perform public._check_session(v_table, p_session_token);

  select r.* into v_restaurant from public.restaurants r where r.id = v_table.restaurant_id;
  if not v_restaurant.is_active then
    raise exception 'This restaurant is not currently active' using errcode = 'P0001';
  end if;
  if not v_restaurant.is_accepting_orders then
    raise exception 'The café is not accepting orders right now' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders o where o.table_id = v_table.id and o.status <> 'cleared') then
    raise exception 'This table already has an active order' using errcode = '23505';
  end if;

  insert into public.orders (restaurant_id, table_id, status, table_note)
  values (v_restaurant.id, v_table.id, 'placed', nullif(trim(coalesce(p_table_note, '')), ''))
  returning id into v_order_id;
  perform public._insert_order_items(v_order_id, v_restaurant.id, p_items);
  update public.tables set status = 'occupied' where id = v_table.id;
  return v_order_id;
end; $$;

-- add_items_to_order: needs the session token
create or replace function public.add_items_to_order(
  p_qr_token text, p_order_id uuid, p_items jsonb, p_session_token text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables; v_order public.orders; v_restaurant public.restaurants;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;
  perform public._check_session(v_table, p_session_token);

  select r.* into v_restaurant from public.restaurants r where r.id = v_table.restaurant_id;
  if not v_restaurant.is_accepting_orders then
    raise exception 'The café is not accepting orders right now' using errcode = 'P0001';
  end if;
  select o.* into v_order from public.orders o where o.id = p_order_id and o.table_id = v_table.id;
  if v_order.id is null then
    raise exception 'Order not found for this table' using errcode = 'P0002';
  end if;
  if v_order.status not in ('placed', 'accepted', 'cooking') then
    raise exception 'This order can no longer be changed' using errcode = 'P0001';
  end if;
  perform public._insert_order_items(p_order_id, v_table.restaurant_id, p_items);
  return p_order_id;
end; $$;

-- request_bill: needs the session token
create or replace function public.request_bill(p_qr_token text, p_order_id uuid, p_session_token text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables; v_order public.orders;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;
  perform public._check_session(v_table, p_session_token);

  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.table_id = v_table.id and o.status <> 'cleared';
  if v_order.id is null then
    raise exception 'No active order for this table' using errcode = 'P0002';
  end if;
  update public.tables set status = 'billing' where id = v_table.id;
  update public.orders set bill_requested_at = now() where id = v_order.id;
end; $$;

-- get_bill: needs the session token (same output shape as before)
create or replace function public.get_bill(p_qr_token text, p_order_id uuid, p_session_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_table public.tables; v_bill public.bills;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_qr_token;
  if v_table.id is null then
    raise exception 'Invalid or expired QR code' using errcode = 'P0002';
  end if;
  perform public._check_session(v_table, p_session_token);

  if not exists (
    select 1 from public.orders o where o.id = p_order_id and o.table_id = v_table.id
  ) then
    raise exception 'Order not found for this table' using errcode = 'P0002';
  end if;

  select b.* into v_bill from public.bills b where b.order_id = p_order_id;
  if v_bill.id is null then return null; end if;

  return jsonb_build_object(
    'id', v_bill.id, 'subtotal', v_bill.subtotal, 'sgst', v_bill.sgst, 'cgst', v_bill.cgst,
    'discount', v_bill.discount, 'total', v_bill.total,
    'payment_method', v_bill.payment_method, 'paid_at', v_bill.paid_at
  );
end; $$;

-- clear_table: release the session lock too
create or replace function public.clear_table(p_order_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := public.auth_restaurant_id();
  v_role   public.user_role := public.auth_role();
  v_order  public.orders; v_bill public.bills; v_token text;
begin
  if v_caller is null or v_role <> 'admin' then
    raise exception 'Only an admin can clear a table' using errcode = '42501';
  end if;
  select o.* into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order.restaurant_id <> v_caller then raise exception 'Not authorised' using errcode = '42501'; end if;
  select b.* into v_bill from public.bills b where b.order_id = p_order_id;
  if v_bill.id is null then raise exception 'Generate the bill before clearing the table' using errcode = 'P0001'; end if;
  if v_bill.payment_method = 'pending' or v_bill.paid_at is null then
    raise exception 'Confirm payment before clearing the table' using errcode = 'P0001';
  end if;

  update public.orders set status = 'cleared' where id = p_order_id;
  -- keep qr_token STABLE (printed sticker) but RELEASE the per-visit session
  update public.tables
    set status = 'empty', session_token = null, session_started_at = null
  where id = v_order.table_id;

  select t.qr_token into v_token from public.tables t where t.id = v_order.table_id;
  return v_token;
end; $$;

-- grants (create-or-replace keeps existing grants, but the new param arity needs
-- re-granting the changed-signature overloads)
grant execute on function public.resolve_table(text, text)               to anon, authenticated;
grant execute on function public.place_order(text, jsonb, text, text)    to anon, authenticated;
grant execute on function public.add_items_to_order(text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.request_bill(text, uuid, text)          to anon, authenticated;
grant execute on function public.get_bill(text, uuid, text)              to anon, authenticated;
