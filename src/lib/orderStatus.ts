/**
 * Order status machine — the single source of truth for labels, ordering, and
 * colour. Mirrors the Postgres enum (CLAUDE.md §9). The customer timeline, KDS
 * chips, and admin floor view all read from here so they never drift.
 *
 *   placed → accepted → cooking → ready → served → billed → cleared
 */

export const ORDER_STATUSES = [
  "placed",
  "accepted",
  "cooking",
  "ready",
  "served",
  "billed",
  "cleared",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

interface StatusMeta {
  /** Customer-facing label. */
  label: string;
  /** Short label for dense KDS / floor chips. */
  short: string;
  /** Theme colour token suffix → text-status-*, bg-status-*, etc. */
  token: OrderStatus;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  placed: { label: "Order placed", short: "Placed", token: "placed" },
  accepted: { label: "Accepted", short: "Accepted", token: "accepted" },
  cooking: { label: "Cooking", short: "Cooking", token: "cooking" },
  ready: { label: "Ready to serve", short: "Ready", token: "ready" },
  served: { label: "Served", short: "Served", token: "served" },
  billed: { label: "Billed", short: "Billed", token: "billed" },
  cleared: { label: "Table cleared", short: "Cleared", token: "cleared" },
};

/** Zero-based position in the lifecycle (for timelines & comparisons). */
export function statusIndex(status: OrderStatus): number {
  return ORDER_STATUSES.indexOf(status);
}
