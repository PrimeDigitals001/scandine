import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Super-admin read layer for food courts (service-role; guarded /superadmin). */

export interface FoodCourt {
  id: string;
  name: string;
  slug: string;
  qr_token: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FoodCourtWithStats extends FoodCourt {
  storeCount: number;
}

export interface CourtStore {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_accepting_orders: boolean;
}

export interface CourtAccessPoint {
  id: string;
  mode: "shared_table" | "pickup";
  label: string;
  qr_token: string;
  capacity: number;
}

export async function listFoodCourts(): Promise<FoodCourtWithStats[]> {
  const admin = createAdminClient();
  const [{ data: courts }, { data: stores }] = await Promise.all([
    admin.from("food_courts").select("*").order("created_at", { ascending: false }),
    admin.from("restaurants").select("food_court_id").not("food_court_id", "is", null),
  ]);
  const count = new Map<string, number>();
  for (const s of stores ?? [])
    count.set(s.food_court_id, (count.get(s.food_court_id) ?? 0) + 1);
  return (courts ?? []).map((c: FoodCourt) => ({
    ...c,
    storeCount: count.get(c.id) ?? 0,
  }));
}

export async function getFoodCourt(id: string): Promise<{
  court: FoodCourt;
  stores: CourtStore[];
  accessPoints: CourtAccessPoint[];
  attachable: { id: string; name: string }[];
} | null> {
  const admin = createAdminClient();
  const [{ data: court }, { data: stores }, { data: aps }, { data: free }] =
    await Promise.all([
      admin.from("food_courts").select("*").eq("id", id).maybeSingle(),
      admin
        .from("restaurants")
        .select("id, name, slug, is_active, is_accepting_orders")
        .eq("food_court_id", id)
        .order("name"),
      admin
        .from("food_court_tables")
        .select("id, mode, label, qr_token, capacity")
        .eq("food_court_id", id)
        .order("label"),
      // restaurants not in ANY court → attachable as stores
      admin
        .from("restaurants")
        .select("id, name")
        .is("food_court_id", null)
        .order("name"),
    ]);
  if (!court) return null;
  return {
    court,
    stores: (stores ?? []) as CourtStore[],
    accessPoints: (aps ?? []) as CourtAccessPoint[],
    attachable: (free ?? []) as { id: string; name: string }[],
  };
}
