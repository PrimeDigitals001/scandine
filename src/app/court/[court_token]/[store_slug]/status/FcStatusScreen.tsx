"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Check, ReceiptText, Store, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/format";
import { getFcOrder, clearFcOrder, removeCourtOrder } from "@/lib/customer/fcSession";
import { ORDER_STATUS_META, statusIndex, type OrderStatus } from "@/lib/orderStatus";
import type { FcStoreResolve, FcActiveOrder } from "@/lib/customer/fcTypes";
import { Button } from "@/components/ui/Button";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/EmptyState";

interface Bill {
  subtotal: number;
  sgst: number;
  cgst: number;
  discount: number;
  total: number;
  payment_method: string;
  paid_at: string | null;
}

const STEPS: OrderStatus[] = ["placed", "accepted", "cooking", "ready", "served"];

export function FcStatusScreen({
  token,
  storeSlug,
}: {
  token: string;
  storeSlug: string;
}) {
  const [ptr] = React.useState(() => getFcOrder(token, storeSlug));
  const [order, setOrder] = React.useState<FcActiveOrder | null>(null);
  const [storeName, setStoreName] = React.useState<string>("");
  const [bill, setBill] = React.useState<Bill | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cleared, setCleared] = React.useState(false);
  const [requesting, setRequesting] = React.useState(false);

  const supabase = React.useMemo(() => createClient(), []);

  const refresh = React.useCallback(async () => {
    if (!ptr) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("resolve_food_court_store", {
      p_token: token,
      p_store_slug: storeSlug,
      p_session_token: ptr.sessionToken,
    });
    const d = data as FcStoreResolve | null;
    if (d?.restaurant?.name) setStoreName(d.restaurant.name);
    if (d?.active_order) setOrder(d.active_order);
    else {
      // order cleared (or none) → drop the pointers so a stale token can't reattach
      clearFcOrder(token, storeSlug);
      if (ptr) removeCourtOrder(token, ptr.orderId);
      setCleared(true);
    }
    setLoading(false);
  }, [supabase, token, storeSlug, ptr]);

  const fetchBill = React.useCallback(async () => {
    if (!ptr) return;
    const { data } = await supabase.rpc("get_fc_bill", {
      p_order_id: ptr.orderId,
      p_session_token: ptr.sessionToken,
    });
    setBill((data as Bill) ?? null);
  }, [supabase, ptr]);

  // initial load (inlined IIFE so setState happens after await, not synchronously)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!ptr) {
        if (alive) setLoading(false);
        return;
      }
      const { data } = await supabase.rpc("resolve_food_court_store", {
        p_token: token,
        p_store_slug: storeSlug,
        p_session_token: ptr.sessionToken,
      });
      if (!alive) return;
      const d = data as FcStoreResolve | null;
      if (d?.restaurant?.name) setStoreName(d.restaurant.name);
      if (d?.active_order) setOrder(d.active_order);
      else {
        clearFcOrder(token, storeSlug);
        setCleared(true);
      }
      setLoading(false);
      const { data: b } = await supabase.rpc("get_fc_bill", {
        p_order_id: ptr.orderId,
        p_session_token: ptr.sessionToken,
      });
      if (alive) setBill((b as Bill) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [ptr, supabase, token, storeSlug]);

  // realtime: order status + items + bill
  React.useEffect(() => {
    if (!ptr) return;
    const ch = supabase
      .channel(`fc-order-${ptr.orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${ptr.orderId}` }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${ptr.orderId}` }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `order_id=eq.${ptr.orderId}` }, () => {
        void fetchBill();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, ptr, refresh, fetchBill]);

  async function requestBill() {
    if (!ptr) return;
    setRequesting(true);
    await supabase.rpc("request_fc_bill", {
      p_order_id: ptr.orderId,
      p_session_token: ptr.sessionToken,
    });
    setRequesting(false);
  }

  if (!ptr || cleared) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 md:max-w-2xl">
        <EmptyState
          icon={Check}
          title={cleared ? "Thanks for your order!" : "No active order"}
          description={
            cleared
              ? "Your order here is complete. Enjoy!"
              : "Start from a store's menu to place an order."
          }
          action={
            <Link href={`/court/${token}`} className="text-sm font-semibold text-brand-600">
              Order from another store
            </Link>
          }
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const idx = order ? statusIndex(order.status) : 0;

  return (
    <div className="mx-auto w-full max-w-md pb-10 md:max-w-2xl">
      <header className="bg-brand-500 px-4 pb-6 pt-6 text-white md:px-6">
        <Link href={`/court/${token}`} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-white/85">
          <ArrowLeft className="size-3.5" /> All stores
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{storeName || "Your order"}</h1>
        {order?.pickup_number != null && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-card bg-white/15 px-4 py-2 backdrop-blur">
            <span className="text-xs font-medium text-white/85">Pickup token</span>
            <span className="text-2xl font-bold tabular-nums">#{order.pickup_number}</span>
          </div>
        )}
      </header>

      {/* status hero */}
      <div className="px-4 py-5 md:px-6">
        <div className="rounded-card border border-hairline/70 bg-surface p-4">
          <p className="text-lg font-bold tracking-tight text-ink">
            {order ? ORDER_STATUS_META[order.status].label : "—"}
          </p>
          {/* simple step strip */}
          <div className="mt-3 flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i <= idx ? "bg-brand-500" : "bg-hairline",
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {order && order.status === "ready"
              ? order.pickup_number != null
                ? "Ready! Collect it from the counter."
                : "Ready to serve!"
              : "We'll update this live as the kitchen works on it."}
          </p>
        </div>

        {/* items */}
        {order && (
          <div className="mt-4 rounded-card border border-hairline/70 bg-surface p-4">
            <h2 className="mb-2 text-sm font-bold tracking-tight text-ink">Your items</h2>
            <ul className="divide-y divide-hairline">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm text-ink">
                    {it.quantity}× {it.name}
                  </span>
                  <PriceTag amount={it.unit_price * it.quantity} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* bill */}
        {bill ? (
          <div className="mt-4 rounded-card border border-hairline/70 bg-surface p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold tracking-tight text-ink">
              <ReceiptText className="size-4 text-brand-500" /> Bill
            </h2>
            <Row label="Subtotal" value={formatINR(bill.subtotal)} />
            <Row label="SGST" value={formatINR(bill.sgst)} muted />
            <Row label="CGST" value={formatINR(bill.cgst)} muted />
            {bill.discount > 0 && <Row label="Discount" value={`− ${formatINR(bill.discount)}`} muted />}
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
              <span className="text-sm font-bold text-ink">Total</span>
              <PriceTag amount={bill.total} size="lg" />
            </div>
            <p className="mt-2 text-xs text-muted">
              {bill.paid_at
                ? `Paid · ${bill.payment_method.toUpperCase()}`
                : "Please pay at the counter."}
            </p>
          </div>
        ) : (
          order &&
          order.status !== "cleared" && (
            <Button
              onClick={requestBill}
              variant="outline"
              fullWidth
              size="lg"
              className="mt-4"
              disabled={requesting}
            >
              {requesting ? <Loader2 className="size-4 animate-spin" /> : "Request bill"}
            </Button>
          )
        )}

        <div className="mt-4 flex flex-col items-center gap-2">
          <Link
            href={`/court/${token}/orders`}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-600"
          >
            <ReceiptText className="size-4" /> View all your orders
          </Link>
          <Link
            href={`/court/${token}`}
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted"
          >
            <Store className="size-4" /> Order from another store
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-sm text-muted" : "text-sm text-ink"}>{label}</span>
      <span className={cn("tabular-nums", muted ? "text-sm text-muted" : "text-sm font-medium text-ink")}>
        {value}
      </span>
    </div>
  );
}
