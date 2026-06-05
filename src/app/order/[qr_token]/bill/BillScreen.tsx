"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ActiveOrder, CustomerRestaurant } from "@/lib/customer/types";
import { Button } from "@/components/ui/Button";
import { PriceTag } from "@/components/ui/PriceTag";
import { Skeleton } from "@/components/ui/Skeleton";

interface Bill {
  id: string;
  subtotal: number;
  sgst: number;
  cgst: number;
  discount: number;
  total: number;
  payment_method: "cash" | "upi" | "card" | "pending";
  paid_at: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function BillScreen({
  token,
  restaurant,
  order,
}: {
  token: string;
  restaurant: CustomerRestaurant;
  order: ActiveOrder;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [bill, setBill] = React.useState<Bill | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [requesting, setRequesting] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const fetchBill = () =>
      supabase
        .rpc("get_bill", { p_qr_token: token, p_order_id: order.id })
        .then(({ data }) => {
          if (!active) return;
          setBill((data as Bill) ?? null);
          setLoading(false);
        });

    fetchBill();
    // refresh if the staff generates/updates the bill while this is open
    const channel = supabase
      .channel(`bill-${order.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bills", filter: `order_id=eq.${order.id}` },
        () => {
          fetchBill();
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, token, order.id]);

  const estSubtotal = order.items.reduce(
    (a, it) => a + it.unit_price * it.quantity,
    0,
  );
  const estSgst = round2((estSubtotal * restaurant.tax_config.sgst) / 100);
  const estCgst = round2((estSubtotal * restaurant.tax_config.cgst) / 100);
  const estTotal = round2(estSubtotal + estSgst + estCgst);

  const paid = bill && bill.payment_method !== "pending" && bill.paid_at;

  async function requestBill() {
    setRequesting(true);
    await supabase.rpc("request_bill", { p_qr_token: token, p_order_id: order.id });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-40 md:max-w-2xl">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-surface/90 px-3 py-3 backdrop-blur">
        <Link
          href={`/order/${token}/status`}
          className="grid size-9 place-items-center rounded-full text-ink active:scale-90"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-ink">Bill</h1>
      </header>

      <div className="px-4 py-5">
        <div className="text-center">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            {restaurant.name}
          </h2>
          {restaurant.address && (
            <p className="mx-auto mt-0.5 max-w-xs text-xs text-muted">
              {restaurant.address}
            </p>
          )}
        </div>

        {/* Itemised */}
        <div className="mt-5 rounded-card border border-hairline/70 bg-surface p-4">
          <ul className="flex flex-col gap-2.5">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-start gap-2 text-sm">
                <span className="font-semibold tabular-nums text-ink">
                  {it.quantity}×
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink-soft">{it.name}</span>
                  {(it.variant || it.addons.length > 0) && (
                    <span className="block truncate text-xs text-muted">
                      {[it.variant?.name, ...it.addons.map((a) => a.name)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-ink">
                  {formatINR(it.unit_price * it.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 border-t border-hairline pt-3">
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <>
                <Row label="Item total" value={formatINR(bill ? bill.subtotal : estSubtotal)} />
                <Row
                  label={`SGST (${restaurant.tax_config.sgst}%)`}
                  value={formatINR(bill ? bill.sgst : estSgst)}
                  muted
                />
                <Row
                  label={`CGST (${restaurant.tax_config.cgst}%)`}
                  value={formatINR(bill ? bill.cgst : estCgst)}
                  muted
                />
                {bill && bill.discount > 0 && (
                  <Row
                    label="Discount"
                    value={`− ${formatINR(bill.discount)}`}
                    discount
                  />
                )}
                <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
                  <span className="text-base font-bold text-ink">Total</span>
                  <PriceTag amount={bill ? bill.total : estTotal} size="xl" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payment / status */}
        {!loading && (
          <div className="mt-4">
            {paid ? (
              <div className="flex items-center justify-center gap-2 rounded-card bg-success-soft px-4 py-3 text-success-strong">
                <CheckCircle2 className="size-5" />
                <span className="text-sm font-semibold capitalize">
                  Paid via {bill!.payment_method}
                </span>
              </div>
            ) : bill ? (
              <div className="flex items-center justify-center gap-2 rounded-card bg-warning-soft px-4 py-3 text-warning-strong">
                <Clock className="size-5" />
                <span className="text-sm font-semibold">
                  Pay at the counter or to your server
                </span>
              </div>
            ) : (
              <p className="text-center text-sm text-muted">
                This is an estimate. Tap below and the staff will finalise your bill.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Request bill (only before a bill exists) */}
      {!loading && !bill && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-hairline bg-surface/95 px-4 pb-3 pt-3 backdrop-blur md:max-w-2xl">
          <Button fullWidth size="lg" loading={requesting} onClick={requestBill}>
            Request bill · {formatINR(estTotal)}
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  discount,
}: {
  label: string;
  value: string;
  muted?: boolean;
  discount?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className={cn(muted ? "text-muted" : "text-ink-soft")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          discount ? "text-danger" : muted ? "text-muted" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
