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
