"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { getSessionToken } from "@/lib/customer/session";
import { useCart, selectSubtotal } from "@/lib/cart/store";
import type { ActiveOrder, CustomerRestaurant } from "@/lib/customer/types";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { VegDot } from "@/components/ui/VegDot";
import { PriceTag } from "@/components/ui/PriceTag";
import { EmptyState } from "@/components/ui/EmptyState";

const round2 = (n: number) => Math.round(n * 100) / 100;
const canAddTo = (o: ActiveOrder | null) =>
  o != null && ["placed", "accepted", "cooking"].includes(o.status);

export function CartScreen({
  token,
  restaurant,
  activeOrder,
}: {
  token: string;
  restaurant: CustomerRestaurant;
  activeOrder: ActiveOrder | null;
}) {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const hydrated = useCart((s) => s.hydrated);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart(selectSubtotal);

  const [tableNote, setTableNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sgst = round2((subtotal * restaurant.tax_config.sgst) / 100);
  const cgst = round2((subtotal * restaurant.tax_config.cgst) / 100);
  const total = round2(subtotal + sgst + cgst);
  const adding = canAddTo(activeOrder);

  async function placeOrder() {
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

    const session = getSessionToken(token);
    const addTo = (orderId: string) =>
      supabase.rpc("add_items_to_order", {
        p_qr_token: token,
        p_order_id: orderId,
        p_items: items,
        p_session_token: session,
      });

    let res = adding
      ? await addTo(activeOrder!.id)
      : await supabase.rpc("place_order", {
          p_qr_token: token,
          p_items: items,
          p_table_note: tableNote.trim() || null,
          p_session_token: session,
        });

    // Race: someone else at the table placed the first order between page load
    // and now → "table already has an active order". Fall back to adding to it,
    // so a second person's order is never lost.
    const conflict =
      res.error && (res.error.code === "23505" || /already has an active order/i.test(res.error.message));
    if (!adding && conflict) {
      const r = await supabase.rpc("resolve_table", { p_qr_token: token, p_session_token: session });
      const existingId = (r.data as { active_order?: { id?: string } } | null)?.active_order?.id;
      if (existingId) res = await addTo(existingId);
    }

    if (res.error) {
      setError(res.error.message || "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    clear();
    router.replace(`/order/${token}/status`);
  }

  if (hydrated && lines.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col md:max-w-2xl">
        <Header token={token} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty"
            description="Add a few items from the menu to get started."
            action={
              <Link
                href={`/order/${token}`}
                className="text-sm font-semibold text-brand-600"
              >
                Browse the menu
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-40 md:max-w-2xl">
      <Header token={token} />

      {adding && (
        <p className="mx-4 mt-4 rounded-control bg-info-soft px-3 py-2 text-sm font-medium text-info">
          Adding to your existing order at the table.
        </p>
      )}

      {/* Lines */}
      <div className="flex flex-col gap-3 px-4 py-4">
        {lines.map((l) => (
          <div
            key={l.key}
            className="flex gap-3 rounded-card border border-hairline/70 bg-surface p-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <VegDot veg={l.isVeg} size={13} />
                <h3 className="truncate text-sm font-semibold text-ink">
                  {l.name}
                </h3>
              </div>
              {(l.variant || l.addons.length > 0) && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[l.variant?.name, ...l.addons.map((a) => a.name)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {l.note && (
                <p className="mt-0.5 truncate text-xs italic text-muted">
                  “{l.note}”
                </p>
              )}
              <div className="mt-1.5">
                <PriceTag amount={l.unitPrice * l.quantity} size="sm" />
              </div>
            </div>
            <div className="flex items-center">
              <QtyStepper
                size="sm"
                value={l.quantity}
                min={0}
                onChange={(n) => setQty(l.key, n)}
                label={l.name}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Order note */}
      {!adding && (
        <div className="px-4">
          <label
            htmlFor="table_note"
            className="mb-1.5 block text-sm font-medium text-ink-soft"
          >
            Note for your table{" "}
            <span className="font-normal text-muted">· optional</span>
          </label>
          <textarea
            id="table_note"
            value={tableNote}
            onChange={(e) => setTableNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. one birthday, please bring a candle"
            className="min-h-16 w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/35"
          />
        </div>
      )}

      {/* Bill preview */}
      <div className="mx-4 mt-4 rounded-card border border-hairline/70 bg-surface p-4">
        <Row label="Item total" value={formatINR(subtotal)} />
        <Row label={`SGST (${restaurant.tax_config.sgst}%)`} value={formatINR(sgst)} muted />
        <Row label={`CGST (${restaurant.tax_config.cgst}%)`} value={formatINR(cgst)} muted />
        <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
          <span className="text-base font-bold text-ink">To pay</span>
          <PriceTag amount={total} size="lg" />
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-4 flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Place order */}
      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-hairline bg-surface/95 px-4 pb-3 pt-3 backdrop-blur md:max-w-2xl">
        <Button
          fullWidth
          size="lg"
          loading={submitting}
          disabled={!hydrated || lines.length === 0}
          onClick={placeOrder}
        >
          {adding ? "Add to order" : "Place order"} · {formatINR(total)}
        </Button>
      </div>
    </div>
  );
}

function Header({ token }: { token: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-surface/90 px-3 py-3 backdrop-blur">
      <Link
        href={`/order/${token}`}
        className="grid size-9 place-items-center rounded-full text-ink active:scale-90"
        aria-label="Back to menu"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <h1 className="text-lg font-bold tracking-tight text-ink">Your order</h1>
    </header>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className={cn(muted ? "text-muted" : "text-ink-soft")}>{label}</span>
      <span className={cn("tabular-nums", muted ? "text-muted" : "text-ink")}>
        {value}
      </span>
    </div>
  );
}
