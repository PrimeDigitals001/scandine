import type { OrderStatus } from "@/lib/orderStatus";

/** Shapes returned by the resolve_table RPC (see migration 003). */

export interface MenuAddon {
  name: string;
  price: number;
}
export interface MenuVariant {
  name: string;
  price_delta: number;
}
export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_veg: boolean;
  is_available: boolean;
  addons: MenuAddon[];
  variants: MenuVariant[];
  sort_order: number;
}
export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItem[];
}
export interface CustomerRestaurant {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  google_review_url: string | null;
  tax_config: { sgst: number; cgst: number };
  is_accepting_orders: boolean;
}
export interface CustomerTable {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
}
export interface ActiveOrderItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  addons: MenuAddon[];
  variant: MenuVariant | null;
  item_note: string | null;
  status: "pending" | "cooking" | "ready";
}
export interface ActiveOrder {
  id: string;
  status: OrderStatus;
  table_note: string | null;
  placed_at: string;
  items: ActiveOrderItem[];
}
export interface ResolveResult {
  locked?: boolean;
  session_token?: string;
  restaurant: CustomerRestaurant;
  table: CustomerTable;
  menu: MenuCategory[];
  active_order: ActiveOrder | null;
}
