"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/format";
import { useFcCart, fcCartKey, fcLines, fcSubtotal } from "@/lib/cart/fcStore";
import {
  getSeatSession,
  setFcOrder,
} from "@/lib/customer/fcSession";
import type { FcStoreResolve } from "@/lib/customer/fcTypes";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/EmptyState";

export function FcCartScreen({
  token,
  storeSlug,
}: {
  token: string;
  storeSlug: string;
}) {
  const router = useRouter();
  const cartKey = fcCartKey(token, storeSlug);
  const hydrated = useFcCart((s) => s.hydrated);
  const lines = useFcCart((s) => fcLines(s, cartKey));
  const setQty = useFcCart((s) => s.setQty);
  const clear = useFcCart((s) => s.clear);
  const subtotal = fcSubtotal(lines);

  const [store, setStore] = React.useState<FcStoreResolve | null>(null);
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // resolve the store for tax config + any existing (shared-seat) active order
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("resolve_food_court_store", {
        p_token: token,
        p_store_slug: storeSlug,
        p_session_token: getSeatSession(token),
      });
      if (!cancelled && data && !(data as FcStoreResolve).locked) {
        setStore(data as FcStoreResolve);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, storeSlug]);

  const tax = store?.restaurant.tax_config ?? { sgst: 0, cgst: 0 };
  const sgst = Math.round(subtotal * (tax.sgst / 100) * 100) / 100;
  const cgst = Math.round(subtotal * (tax.cgst / 100) * 100) / 100;
  const total = subtotal + sgst + cgst;

  const activeOrder = store?.active_order ?? null;
  const canAddTo =
    activeOrder != null &&
    ["placed", "accepted", "cooking"].includes(activeOrder.status);

  async function place() {
    if (lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const items = lines.map((l) => ({
      menu_item_id: l.menuItemId,
      quantity: l.quantity,
      variant: l.variant?.name ?? null,
      addons: l.addons.map((a) => a.name),
      item_note: l.note,
    }));
    const seat = getSeatSession(token);

    if (canAddTo && activeOrder) {
      const { error: e } = await supabase.rpc("add_items_to_fc_order", {
        p_order_id: activeOrder.id,
        p_items: items,
        p_session_token: seat,
      });
      if (e) {
        setError(e.message || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      setFcOrder(token, storeSlug, { orderId: activeOrder.id, sessionToken: seat ?? "" });
    } else {
      const { data, error: e } = await supabase.rpc("place_food_court_order", {
        p_token: token,
        p_store_slug: storeSlug,
        p_items: items,
        p_table_note: note.trim() || null,
        p_session_token: seat,
      });
      if (e || !data) {
        setError(e?.message || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      const res = data as { order_id: string; session_token: string };
      setFcOrder(token, storeSlug, {
        orderId: res.order_id,
        sessionToken: res.session_token,
      });
    }
    clear(cartKey);
    router.replace(`/court/${token}/${storeSlug}/status`);
  }

  if (hydrated && lines.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 md:max-w-2xl">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add items from the menu to get started."
          action={
            <Link href={`/court/${token}/${storeSlug}`} className="text-sm font-semibold text-brand-600">
              Back to the menu
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md pb-40 md:max-w-2xl">
      <header className="bg-brand-500 px-4 pb-5 pt-6 text-white md:px-6">
        <Link
          href={`/court/${token}/${storeSlug}`}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-white/85"
        >
          <ArrowLeft className="size-3.5" /> Back to menu
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {store?.restaurant.name ?? "Your order"}
        </h1>
        {canAddTo && (
          <p className="mt-0.5 text-xs font-medium text-white/85">
            Adding to your existing order
          </p>
        )}
      </header>

      <div className="px-4 py-5 md:px-6">
        <ul className="divide-y divide-hairline rounded-card border border-hairline/70 bg-surface px-4">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{l.name}</p>
                {(l.variant || l.addons.length > 0 || l.note) && (
                  <p className="truncate text-xs text-muted">
                    {[l.variant?.name, ...l.addons.map((a) => a.name), l.note]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <span className="mt-0.5 block">
                  <PriceTag amount={l.unitPrice * l.quantity} size="sm" />
                </span>
              </div>
              <QtyStepper
                size="sm"
                value={l.quantity}
                min={0}
                onChange={(n) => setQty(cartKey, l.key, n)}
                label={l.name}
              />
            </li>
          ))}
        </ul>

        {!canAddTo && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-semibold text-ink">
              Note for the store <span className="font-normal text-muted">· optional</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={160}
              placeholder="e.g. extra spicy, no onions"
              className="min-h-16 w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/35"
            />
          </div>
        )}

        {/* totals */}
        <div className="mt-4 rounded-card border border-hairline/70 bg-surface p-4">
          <Row label="Subtotal" value={formatINR(subtotal)} />
          <Row label={`SGST (${tax.sgst}%)`} value={formatINR(sgst)} muted />
          <Row label={`CGST (${tax.cgst}%)`} value={formatINR(cgst)} muted />
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
            <span className="text-sm font-bold text-ink">Total</span>
            <PriceTag amount={total} size="lg" />
          </div>
        </div>
      </div>

      {/* place bar */}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md px-4 pb-3 md:max-w-2xl md:px-6">
        {error && (
          <p className="mb-2 flex items-center gap-1.5 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </p>
        )}
        <Button onClick={place} fullWidth size="lg" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : canAddTo ? (
            <>Add to order · {formatINR(total)}</>
          ) : (
            <>Place order · {formatINR(total)}</>
          )}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-sm text-muted" : "text-sm text-ink"}>{label}</span>
      <span className={muted ? "text-sm text-muted tabular-nums" : "text-sm font-medium text-ink tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
