import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Super-admin read layer. Uses the service-role client (bypasses RLS) — only
 * ever imported by server components under the guarded /superadmin panel.
 */

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  gst_number: string | null;
  address: string | null;
  google_review_url: string | null;
  tax_config: { sgst: number; cgst: number };
  subscription_plan: "free" | "starter" | "pro";
  pos_mode: "standalone" | "pos_integrated";
  is_active: boolean;
  onboarded_by: string | null;
  onboarded_at: string | null;
  created_at: string;
}

export interface RestaurantWithStats extends Restaurant {
  tableCount: number;
  ordersThisMonth: number;
}

export interface TableRow {
  id: string;
  table_number: string;
  qr_token: string;
  status: "empty" | "occupied" | "billing";
  capacity: number;
}

export interface StaffRow {
  id: string;
  full_name: string | null;
  role: "admin" | "staff";
  is_active: boolean;
  email: string | null;
}

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function listRestaurants(): Promise<RestaurantWithStats[]> {
  const admin = createAdminClient();
  const monthStart = startOfMonthISO();

  const [{ data: restaurants }, { data: tables }, { data: orders }] =
    await Promise.all([
      admin.from("restaurants").select("*").order("created_at", { ascending: false }),
      admin.from("tables").select("restaurant_id"),
      admin.from("orders").select("restaurant_id").gte("placed_at", monthStart),
    ]);

  const tableCount = new Map<string, number>();
  for (const t of tables ?? [])
    tableCount.set(t.restaurant_id, (tableCount.get(t.restaurant_id) ?? 0) + 1);

  const orderCount = new Map<string, number>();
  for (const o of orders ?? [])
    orderCount.set(o.restaurant_id, (orderCount.get(o.restaurant_id) ?? 0) + 1);

  return (restaurants ?? []).map((r: Restaurant) => ({
    ...r,
    tableCount: tableCount.get(r.id) ?? 0,
    ordersThisMonth: orderCount.get(r.id) ?? 0,
  }));
}

export interface DashboardStats {
  restaurants: number;
  active: number;
  tables: number;
  ordersToday: number;
}

export interface DashboardData {
  restaurants: RestaurantWithStats[];
  stats: DashboardStats;
}

/** One parallel batch for the whole dashboard (list + stats) — single round-trip. */
export async function getDashboardData(): Promise<DashboardData> {
  const admin = createAdminClient();
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [restaurants, ordersTodayRes] = await Promise.all([
    listRestaurants(),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("placed_at", startOfToday.toISOString()),
  ]);

  return {
    restaurants,
    stats: {
      restaurants: restaurants.length,
      active: restaurants.filter((r) => r.is_active).length,
      tables: restaurants.reduce((sum, r) => sum + r.tableCount, 0),
      ordersToday: ordersTodayRes.count ?? 0,
    },
  };
}

export async function getRestaurant(id: string): Promise<{
  restaurant: Restaurant;
  tables: TableRow[];
  staff: StaffRow[];
} | null> {
  const admin = createAdminClient();

  // One batch: restaurant + its tables + its profiles, all in parallel.
  const [{ data: restaurant }, { data: tables }, { data: profiles }] =
    await Promise.all([
      admin.from("restaurants").select("*").eq("id", id).maybeSingle(),
      admin.from("tables").select("*").eq("restaurant_id", id).order("table_number"),
      admin.from("profiles").select("*").eq("restaurant_id", id),
    ]);
  if (!restaurant) return null;

  // Resolve emails ONLY for this café's members (scales as tenants grow, unlike
  // listUsers() which scans every user in the project). Parallel, tiny N.
  const emailEntries = await Promise.all(
    (profiles ?? []).map(async (p: Omit<StaffRow, "email">) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return [p.id, data.user?.email ?? null] as const;
    }),
  );
  const emailById = new Map(emailEntries);

  const staff: StaffRow[] = (profiles ?? []).map((p: Omit<StaffRow, "email">) => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    is_active: p.is_active,
    email: emailById.get(p.id) ?? null,
  }));

  return { restaurant, tables: (tables ?? []) as TableRow[], staff };
}
