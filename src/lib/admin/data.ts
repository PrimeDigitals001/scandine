import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/orderStatus";

// All reads use the cookie-bound server client → RLS scopes to the admin's
// own restaurant automatically. No restaurant_id filter needed.

export interface FloorTable {
  id: string;
  table_number: string;
  status: "empty" | "occupied" | "billing";
  capacity: number;
  locked: boolean; // a customer claimed the table (session) — may have no order yet
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
    supabase.from("tables").select("id, table_number, status, capacity, session_token").order("table_number"),
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
    locked: t.session_token != null,
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
  food_court_id: string | null;
  pickup_number: number | null;
  items: BillingItem[];
  bill: BillingBill | null;
}

export async function getBillingOrders(): Promise<BillingOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, status, table_note, placed_at, food_court_id, pickup_number, tables(table_number), order_items(id, name_snapshot, quantity, unit_price), bills(id, subtotal, sgst, cgst, discount, total, payment_method, paid_at)",
    )
    .neq("status", "cleared")
    .order("placed_at", { ascending: true });

  return (data ?? []).map(
    (o: {
      id: string;
      status: OrderStatus;
      table_note: string | null;
      placed_at: string;
      food_court_id: string | null;
      pickup_number: number | null;
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
        food_court_id: o.food_court_id,
        pickup_number: o.pickup_number,
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
  image_url: string | null;
  video_url: string | null;
  is_daily_special: boolean;
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
      .select(
        "id, category_id, name, description, price, is_veg, is_available, image_url, video_url, is_daily_special, sort_order",
      )
      .order("sort_order"),
  ]);
  return { categories: cats.data ?? [], items: items.data ?? [] };
}

// ---- sales report (honest, complete — for the owner's books / CA) ----------
export interface SalesByMethod {
  method: "cash" | "upi" | "card";
  count: number;
  subtotal: number;
  gst: number;
  discount: number;
  total: number;
}
export interface SalesReport {
  byMethod: SalesByMethod[];
  totals: { count: number; subtotal: number; gst: number; discount: number; total: number };
  topItems: { name: string; qty: number; revenue: number }[];
}

export async function getSalesReport(fromIso: string, toIso: string): Promise<SalesReport> {
  const supabase = await createClient(); // RLS scopes bills/order_items to this café
  const { data: bills } = await supabase
    .from("bills")
    .select("order_id, subtotal, sgst, cgst, discount, total, payment_method, paid_at")
    .neq("payment_method", "pending")
    .not("paid_at", "is", null)
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso);

  const methods: SalesByMethod["method"][] = ["cash", "upi", "card"];
  const agg = new Map<string, SalesByMethod>(
    methods.map((m) => [m, { method: m, count: 0, subtotal: 0, gst: 0, discount: 0, total: 0 }]),
  );
  const totals = { count: 0, subtotal: 0, gst: 0, discount: 0, total: 0 };
  const orderIds: string[] = [];
  for (const b of bills ?? []) {
    const m = agg.get(b.payment_method);
    if (!m) continue;
    const gst = Number(b.sgst) + Number(b.cgst);
    m.count += 1;
    m.subtotal += Number(b.subtotal);
    m.gst += gst;
    m.discount += Number(b.discount);
    m.total += Number(b.total);
    totals.count += 1;
    totals.subtotal += Number(b.subtotal);
    totals.gst += gst;
    totals.discount += Number(b.discount);
    totals.total += Number(b.total);
    orderIds.push(b.order_id);
  }

  // top items sold in those (paid) orders
  const topItems: { name: string; qty: number; revenue: number }[] = [];
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("name_snapshot, quantity, unit_price, order_id")
      .in("order_id", orderIds);
    const byName = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items ?? []) {
      const cur = byName.get(it.name_snapshot) ?? { name: it.name_snapshot, qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += Number(it.unit_price) * it.quantity;
      byName.set(it.name_snapshot, cur);
    }
    topItems.push(...[...byName.values()].sort((a, b) => b.qty - a.qty).slice(0, 10));
  }

  return { byMethod: [...agg.values()], totals, topItems };
}

export interface StaffMember {
  id: string;
  full_name: string | null;
  is_active: boolean;
  email: string | null;
}

export interface TableFull {
  id: string;
  table_number: string;
  qr_token: string;
  status: "empty" | "occupied" | "billing";
  capacity: number;
}

export async function getTables(): Promise<TableFull[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tables")
    .select("id, table_number, qr_token, status, capacity")
    .order("table_number");
  return data ?? [];
}

// Emails live in auth.users → needs the service role. Call only after the page
// has confirmed an admin via getAdminContext, and pass that restaurantId.
export async function getStaff(restaurantId: string): Promise<StaffMember[]> {
  const svc = createAdminClient();
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, full_name, is_active, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("role", "staff")
    .order("created_at", { ascending: true });

  return Promise.all(
    (profiles ?? []).map(async (p: { id: string; full_name: string | null; is_active: boolean }) => {
      const { data } = await svc.auth.admin.getUserById(p.id);
      return {
        id: p.id,
        full_name: p.full_name,
        is_active: p.is_active,
        email: data.user?.email ?? null,
      };
    }),
  );
}
