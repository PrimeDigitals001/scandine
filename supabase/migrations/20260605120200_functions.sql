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
