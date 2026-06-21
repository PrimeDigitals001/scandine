import type { MenuCategory, CustomerRestaurant, ActiveOrder } from "./types";

/** Shapes returned by the food-court RPCs (migration 008 functions). */

export type FcMode = "pickup" | "shared_table";

export interface FcStoreSummary {
  id: string;
  name: string;
  slug: string;
  is_accepting_orders: boolean;
}

/** resolve_food_court(token) → court + access point + store list */
export interface FcResolve {
  food_court: { id: string; name: string; slug: string };
  access: { mode: FcMode; id: string | null; label: string; qr_token: string };
  stores: FcStoreSummary[];
}

export interface FcActiveOrder extends ActiveOrder {
  pickup_number?: number | null;
}

/** resolve_food_court_store(token, slug, session?) → one store's menu + order */
export interface FcStoreResolve {
  locked?: boolean;
  mode: FcMode;
  session_token?: string | null;
  pickup_number?: number | null;
  food_court: { id?: string; name: string; slug?: string };
  access: { id?: string | null; label: string; qr_token?: string };
  restaurant: CustomerRestaurant;
  menu: MenuCategory[];
  active_order: FcActiveOrder | null;
}

/** place_food_court_order(...) → */
export interface FcPlaceResult {
  order_id: string;
  pickup_number: number | null;
  session_token: string;
}
