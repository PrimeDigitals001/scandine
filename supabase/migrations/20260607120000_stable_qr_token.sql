-- ============================================================================
-- ScanDine — 005 Stable QR token + live "request bill" signal
--
-- (A) Clearing a table no longer regenerates its qr_token. The token is a
--     printed sticker on the physical table, so it must stay constant for the
--     table's whole life — one sticker, reused by every guest. We still mark the
--     order 'cleared' and the table 'empty'; a stale phone simply starts a fresh
--     order on the now-empty table (the "one active order per table" rule keeps
--     that clean).
-- (B) request_bill now stamps orders.bill_requested_at. `orders` is anon-readable
--     so its realtime stream reaches the owner's admin screen reliably, letting
--     the Floor/Billing pages live-update + alert the moment a guest asks.
--
-- `create or replace` preserves each function's existing EXECUTE grants.
-- Safe to run more than once.
-- ============================================================================

-- (B) new column for the live bill-request signal
alter table public.orders add column if not exists bill_requested_at timestamptz;

-- (B) request_bill: mark the table 'billing' AND stamp the order
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
  update public.orders set bill_requested_at = now() where id = v_order.id;
end;
$$;

-- (A) clear_table: free the table but keep the qr_token stable
create or replace function public.clear_table(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := public.auth_restaurant_id();
  v_role   public.user_role := public.auth_role();
  v_order  public.orders;
  v_bill   public.bills;
  v_token  text;
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

  -- Free the table for the next guest, but keep the qr_token STABLE so the
  -- printed sticker keeps working forever.
  update public.orders set status = 'cleared' where id = p_order_id;
  update public.tables set status = 'empty' where id = v_order.table_id;

  select t.qr_token into v_token from public.tables t where t.id = v_order.table_id;
  return v_token;
end;
$$;
