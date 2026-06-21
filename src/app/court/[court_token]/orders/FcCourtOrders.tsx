"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, ChevronRight, Store, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCourtOrders, removeCourtOrder } from "@/lib/customer/fcSession";
import type { FcStoreResolve } from "@/lib/customer/fcTypes";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/orderStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SupabaseClient } from "@supabase/supabase-js";

interface Card {
  slug: string;
  storeName: string;
  orderId: string;
  status: OrderStatus;
  pickupNumber: number | null;
  itemCount: number;
  total: number;
}

// Resolve every order the customer placed in this court; drop ones that cleared.
async function fetchCourtCards(
  token: string,
  supabase: SupabaseClient,
): Promise<{ cards: Card[]; courtId: string | null }> {
  const ptrs = getCourtOrders(token);
  let courtId: string | null = null;
  const cards: Card[] = [];
  await Promise.all(
    ptrs.map(async (p) => {
      const { data } = await supabase.rpc("resolve_food_court_store", {
        p_token: token,
        p_store_slug: p.slug,
        p_session_token: p.sessionToken,
      });
      const d = data as FcStoreResolve | null;
      if (d?.food_court?.id) courtId = d.food_court.id;
      const o = d?.active_order;
      if (!o) {
        removeCourtOrder(token, p.orderId);
        return;
      }
      cards.push({
        slug: p.slug,
        storeName: d!.restaurant.name,
        orderId: o.id,
        status: o.status,
        pickupNumber: o.pickup_number ?? null,
        itemCount: o.items.reduce((a, it) => a + it.quantity, 0),
        total: o.items.reduce((a, it) => a + it.unit_price * it.quantity, 0),
      });
    }),
  );
  // stable order: most-advanced first feels odd; keep placement order by name
  cards.sort((a, b) => a.storeName.localeCompare(b.storeName));
  return { cards, courtId };
}

export function FcCourtOrders({ token }: { token: string }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [cards, setCards] = React.useState<Card[]>([]);
  const [courtId, setCourtId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const { cards, courtId } = await fetchCourtCards(token, supabase);
    setCards(cards);
    setCourtId(courtId);
    setLoading(false);
  }, [token, supabase]);

  // initial load (inlined so setState is post-await, not synchronous)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { cards, courtId } = await fetchCourtCards(token, supabase);
      if (!alive) return;
      setCards(cards);
      setCourtId(courtId);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [token, supabase]);

  // live: any order change in this court re-resolves the list
  React.useEffect(() => {
    if (!courtId) return;
    const ch = supabase
      .channel(`fc-court-${courtId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `food_court_id=eq.${courtId}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, courtId, load]);

  return (
    <div className="mx-auto w-full max-w-md pb-10 md:max-w-3xl">
      <header className="bg-brand-500 px-4 pb-6 pt-6 text-white md:px-6">
        <Link
          href={`/court/${token}`}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-white/85"
        >
          <ArrowLeft className="size-3.5" /> All stores
        </Link>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Your orders</h1>
        <p className="mt-0.5 text-sm text-white/85">Everything you&apos;ve ordered in this food court.</p>
      </header>

      <div className="px-4 py-5 md:px-6">
        {loading ? (
          <div className="flex justify-center py-12 text-muted">
            <Loader2 className="size-6 animate-spin text-brand-500" />
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No active orders"
            description="Pick a store and place an order — it'll show up here."
            action={
              <Link href={`/court/${token}`} className="text-sm font-semibold text-brand-600">
                Browse stores
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cards.map((c) => (
              <Link
                key={c.orderId}
                href={`/court/${token}/${c.slug}/status`}
                className="flex items-center gap-3 rounded-card border border-hairline/70 bg-surface p-4 shadow-card transition active:scale-[0.99]"
              >
                <div className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-500">
                  <Store className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.storeName}</p>
                  <p className="mt-0.5 flex items-center gap-2">
                    <StatusChip status={c.status} live />
                    {c.pickupNumber != null && (
                      <span className="text-xs font-bold text-ink tabular-nums">#{c.pickupNumber}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.itemCount} item{c.itemCount === 1 ? "" : "s"} ·{" "}
                    {ORDER_STATUS_META[c.status].label}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <PriceTag amount={c.total} size="sm" />
                  <ChevronRight className="size-4 text-muted" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
