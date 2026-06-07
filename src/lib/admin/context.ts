import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  gst_number: string | null;
  address: string | null;
  google_review_url: string | null;
  tax_config: { sgst: number; cgst: number };
  is_active: boolean;
  is_accepting_orders: boolean;
}

export interface AdminContext {
  userId: string;
  restaurantId: string;
  role: "admin" | "staff";
  fullName: string | null;
  restaurant: AdminRestaurant;
}

/** The signed-in admin's identity + restaurant (RLS-scoped). null if not signed in. */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.restaurant_id) return null;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select(
      "id, name, slug, gst_number, address, google_review_url, tax_config, is_active, is_accepting_orders",
    )
    .eq("id", profile.restaurant_id)
    .maybeSingle();
  if (!restaurant) return null;

  return {
    userId: user.id,
    restaurantId: profile.restaurant_id,
    role: profile.role,
    fullName: profile.full_name,
    restaurant: restaurant as AdminRestaurant,
  };
}
