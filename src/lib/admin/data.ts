import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/orderStatus";

// All reads use the cookie-bound server client → RLS scopes to the admin's
// own restaurant automatically. No restaurant_id filter needed.

export interface FloorTable {
  id: string;
  table_number: string;
  status: "empty" | "occupied" | "billing";
  capacity: number;
  order: { id: string; status: OrderStatus; placed_at: string } | null;
}

export interface DashboardData {
  tables: FloorTable[];
  stats: {
    occupied: number;
    activeOrders: number;
    ordersToday: number;
    revenueToday: number;
  };
}

export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  const [tablesRes, ordersRes, todayOrdersRes, paidRes] = await Promise.all([
    supabase.from("tables").select("id, table_number, status, capacity").order("table_number"),
    supabase.from("orders").select("id, table_id, status, placed_at").neq("status", "cleared"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("placed_at", todayIso),
    supabase.from("bills").select("total, paid_at").gte("paid_at", todayIso),
  ]);

  const activeByTable = new Map<string, { id: string; status: OrderStatus; placed_at: string }>();
  for (const o of ordersRes.data ?? []) {
    // keep the latest active order per table
    if (!activeByTable.has(o.table_id)) {
      activeByTable.set(o.table_id, { id: o.id, status: o.status, placed_at: o.placed_at });
    }
  }

  const tables: FloorTable[] = (tablesRes.data ?? []).map((t) => ({
    id: t.id,
    table_number: t.table_number,
    status: t.status,
    capacity: t.capacity,
    order: activeByTable.get(t.id) ?? null,
  }));

  const revenueToday = (paidRes.data ?? []).reduce(
    (sum: number, b: { total: number | string }) => sum + Number(b.total),
    0,
  );

  return {
    tables,
    stats: {
      occupied: tables.filter((t) => t.status !== "empty").length,
      activeOrders: ordersRes.data?.length ?? 0,
      ordersToday: todayOrdersRes.count ?? 0,
      revenueToday,
    },
  };
}

export interface BillingItem {
  id: string;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
}
export interface BillingBill {
  id: string;
  subtotal: number;
  sgst: number;
  cgst: number;
  discount: number;
  total: number;
  payment_method: "cash" | "upi" | "card" | "pending";
  paid_at: string | null;
}
export interface BillingOrder {
  id: string;
  status: OrderStatus;
  table_note: string | null;
  placed_at: string;
  table_number: string;
  items: BillingItem[];
  bill: BillingBill | null;
}

export async function getBillingOrders(): Promise<BillingOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, status, table_note, placed_at, tables(table_number), order_items(id, name_snapshot, quantity, unit_price), bills(id, subtotal, sgst, cgst, discount, total, payment_method, paid_at)",
    )
    .neq("status", "cleared")
    .order("placed_at", { ascending: true });

  return (data ?? []).map(
    (o: {
      id: string;
      status: OrderStatus;
      table_note: string | null;
      placed_at: string;
      tables: { table_number: string } | { table_number: string }[] | null;
      order_items: BillingItem[];
      bills: BillingBill | BillingBill[] | null;
    }) => {
      const table = Array.isArray(o.tables) ? o.tables[0] : o.tables;
      const bill = Array.isArray(o.bills) ? (o.bills[0] ?? null) : o.bills;
      return {
        id: o.id,
        status: o.status,
        table_note: o.table_note,
        placed_at: o.placed_at,
        table_number: table?.table_number ?? "—",
        items: o.order_items ?? [],
        bill: bill ?? null,
      };
    },
  );
}

export interface MenuCategoryRow {
  id: string;
  name: string;
  sort_order: number;
  is_visible: boolean;
}
export interface MenuItemRow {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  sort_order: number;
}

export async function getMenu(): Promise<{
  categories: MenuCategoryRow[];
  items: MenuItemRow[];
}> {
  const supabase = await createClient();
  const [cats, items] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, sort_order, is_visible")
      .order("sort_order"),
    supabase
      .from("menu_items")
      .select("id, category_id, name, description, price, is_veg, is_available, sort_order")
      .order("sort_order"),
  ]);
  return { categories: cats.data ?? [], items: items.data ?? [] };
}
