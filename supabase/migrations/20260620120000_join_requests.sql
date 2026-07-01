-- ============================================================================
-- ScanDine — 010 "Ask to join" a table/seat (approve-based join, alongside the
-- share link). A person who scans an in-use table can request to join; whoever
-- holds the table's session sees it and approves; the requester is then handed
-- the live session token (only after approval). Works for single-café tables AND
-- food-court shared seats. Additive; no existing objects changed.
--
-- Security: join_requests carries no secret in a readable row; the session token
-- is delivered ONLY to the approved requester via claim_join (which checks their
-- private request_token). RLS default-deny; all access via these definer RPCs.
-- ============================================================================

create table if not exists public.join_requests (
  id                   uuid primary key default gen_random_uuid(),
  table_id             uuid references public.tables (id) on delete cascade,
  food_court_table_id  uuid references public.food_court_tables (id) on delete cascade,
  request_token        text not null,          -- requester's private ticket
  requester_name       text,
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'denied')),
  created_at           timestamptz not null default now(),
  constraint jr_anchor_chk check (
    (table_id is not null and food_court_table_id is null)
    or (table_id is null and food_court_table_id is not null)
  )
);
create index join_requests_table_idx on public.join_requests (table_id) where status = 'pending';
create index join_requests_fct_idx   on public.join_requests (food_court_table_id) where status = 'pending';

alter table public.join_requests enable row level security;
-- no policies → default-deny for anon/authenticated; the SECURITY DEFINER RPCs
-- below are the only access path. Service role (cleanup) keeps full access.
grant all on public.join_requests to service_role;

-- ---- requester: ask to join an in-use table/seat ---------------------------
create or replace function public.request_to_join(
  p_token text, p_request_token text, p_name text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_table public.tables; v_fct public.food_court_tables;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_token;
  if v_table.id is not null then
    if v_table.session_token is null then
      raise exception 'This table is free — just scan to order' using errcode = 'P0001';
    end if;
    delete from public.join_requests where table_id = v_table.id and request_token = p_request_token;
    insert into public.join_requests (table_id, request_token, requester_name)
    values (v_table.id, p_request_token, nullif(trim(coalesce(p_name, '')), ''));
    return;
  end if;

  select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
  if v_fct.id is not null then
    if v_fct.session_token is null then
      raise exception 'This seat is free — just scan to order' using errcode = 'P0001';
    end if;
    delete from public.join_requests where food_court_table_id = v_fct.id and request_token = p_request_token;
    insert into public.join_requests (food_court_table_id, request_token, requester_name)
    values (v_fct.id, p_request_token, nullif(trim(coalesce(p_name, '')), ''));
    return;
  end if;

  raise exception 'Invalid or expired QR code' using errcode = 'P0002';
end; $$;

-- ---- table-holder: list pending requests (must hold the session) -----------
create or replace function public.list_join_requests(p_token text, p_session_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_table public.tables; v_fct public.food_court_tables;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_token;
  if v_table.id is not null then
    perform public._check_session(v_table, p_session_token);
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', jr.id, 'name', coalesce(jr.requester_name, 'Guest'),
                                          'created_at', jr.created_at) order by jr.created_at)
      from public.join_requests jr
      where jr.table_id = v_table.id and jr.status = 'pending'
        and jr.created_at > now() - interval '3 minutes'
    ), '[]'::jsonb);
  end if;

  select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
  if v_fct.id is not null then
    perform public._check_fc_session(v_fct, p_session_token);
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', jr.id, 'name', coalesce(jr.requester_name, 'Guest'),
                                          'created_at', jr.created_at) order by jr.created_at)
      from public.join_requests jr
      where jr.food_court_table_id = v_fct.id and jr.status = 'pending'
        and jr.created_at > now() - interval '3 minutes'
    ), '[]'::jsonb);
  end if;

  raise exception 'Invalid or expired QR code' using errcode = 'P0002';
end; $$;

-- ---- table-holder: accept / decline a request ------------------------------
create or replace function public.respond_join_request(
  p_token text, p_session_token text, p_request_id uuid, p_approve boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_table public.tables; v_fct public.food_court_tables; v_new text;
begin
  v_new := case when p_approve then 'approved' else 'denied' end;
  select t.* into v_table from public.tables t where t.qr_token = p_token;
  if v_table.id is not null then
    perform public._check_session(v_table, p_session_token);
    update public.join_requests set status = v_new
      where id = p_request_id and table_id = v_table.id and status = 'pending';
    return;
  end if;
  select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
  if v_fct.id is not null then
    perform public._check_fc_session(v_fct, p_session_token);
    update public.join_requests set status = v_new
      where id = p_request_id and food_court_table_id = v_fct.id and status = 'pending';
    return;
  end if;
  raise exception 'Invalid or expired QR code' using errcode = 'P0002';
end; $$;

-- ---- requester: poll for the outcome; on approval, receive the session -----
create or replace function public.claim_join(p_token text, p_request_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_table public.tables; v_fct public.food_court_tables; v_req public.join_requests; v_session text;
begin
  select t.* into v_table from public.tables t where t.qr_token = p_token;
  if v_table.id is not null then
    select jr.* into v_req from public.join_requests jr
      where jr.table_id = v_table.id and jr.request_token = p_request_token
      order by jr.created_at desc limit 1;
    v_session := v_table.session_token;
  else
    select f.* into v_fct from public.food_court_tables f where f.qr_token = p_token;
    if v_fct.id is null then raise exception 'Invalid or expired QR code' using errcode = 'P0002'; end if;
    select jr.* into v_req from public.join_requests jr
      where jr.food_court_table_id = v_fct.id and jr.request_token = p_request_token
      order by jr.created_at desc limit 1;
    v_session := v_fct.session_token;
  end if;

  if v_req.id is null then return jsonb_build_object('status', 'none'); end if;
  if v_req.status = 'denied' then return jsonb_build_object('status', 'denied'); end if;
  if v_req.status = 'pending' then
    if v_req.created_at < now() - interval '3 minutes' then
      return jsonb_build_object('status', 'expired');
    end if;
    return jsonb_build_object('status', 'pending');
  end if;
  -- approved
  if v_session is null then return jsonb_build_object('status', 'expired'); end if; -- table was cleared
  return jsonb_build_object('status', 'approved', 'session_token', v_session);
end; $$;

-- ---- grants ----------------------------------------------------------------
revoke execute on function public.request_to_join(text, text, text)          from public;
revoke execute on function public.list_join_requests(text, text)             from public;
revoke execute on function public.respond_join_request(text, text, uuid, boolean) from public;
revoke execute on function public.claim_join(text, text)                     from public;

grant execute on function public.request_to_join(text, text, text)           to anon, authenticated;
grant execute on function public.list_join_requests(text, text)              to anon, authenticated;
grant execute on function public.respond_join_request(text, text, uuid, boolean)  to anon, authenticated;
grant execute on function public.claim_join(text, text)                      to anon, authenticated;
