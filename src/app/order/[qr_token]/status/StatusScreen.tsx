"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Plus,
  ReceiptText,
  Star,
  X,
  ClipboardCheck,
  CircleCheck,
  Flame,
  BellRing,
  Smile,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { getSessionToken, clearSessionToken } from "@/lib/customer/session";
import {
  ORDER_STATUS_META,
  statusIndex,
  type OrderStatus,
} from "@/lib/orderStatus";
import type {
  ActiveOrder,
  CustomerRestaurant,
  ResolveResult,
} from "@/lib/customer/types";
import { Button, buttonVariants } from "@/components/ui/Button";

const TIMELINE: OrderStatus[] = [
  "placed",
  "accepted",
  "cooking",
  "ready",
  "served",
];

const HERO: Record<OrderStatus, { icon: LucideIcon; title: string; sub: string }> = {
  placed: { icon: ClipboardCheck, title: "Order placed", sub: "Sent to the kitchen." },
  accepted: { icon: CircleCheck, title: "Order accepted", sub: "The kitchen has it." },
  cooking: { icon: Flame, title: "Cooking now", sub: "Your food is being made." },
  ready: { icon: BellRing, title: "Ready to serve!", sub: "Coming to your table." },
  served: { icon: Smile, title: "Served — enjoy!", sub: "Hope it's delicious." },
  billed: { icon: ReceiptText, title: "Your bill is ready", sub: "Tap below to view it." },
  cleared: { icon: Heart, title: "Thanks for dining!", sub: "See you again soon." },
};

function istTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusScreen({
  token,
  restaurant,
  tableNumber,
  initialOrder,
}: {
  token: string;
  restaurant: CustomerRestaurant;
  tableNumber: string;
  initialOrder: ActiveOrder;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [order, setOrder] = React.useState<ActiveOrder>(initialOrder);
  const [cleared, setCleared] = React.useState(false);
  const [billRequested, setBillRequested] = React.useState(false);
  const [ratingDismissed, setRatingDismissed] = React.useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      !!localStorage.getItem(`sd-rated-${initialOrder.id}`),
  );

  const refresh = React.useCallback(async () => {
    const { data } = await supabase.rpc("resolve_table", {
      p_qr_token: token,
      p_session_token: getSessionToken(token),
    });
    const d = data as ResolveResult | null;
    if (d?.active_order) setOrder(d.active_order);
    else {
      // table cleared (or session ended) → drop the session so a stale cookie
      // can't re-claim this table later.
      clearSessionToken(token);
      setCleared(true);
    }
  }, [supabase, token]);

  // Live updates: any change to this order (or its items) refreshes the screen.
  React.useEffect(() => {
    const channel = supabase
      .channel(`order-${initialOrder.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${initialOrder.id}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${initialOrder.id}` },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, initialOrder.id, refresh]);

  // Rating prompt fires once per order, when served/billed (derived, no effect).
  const showRating =
    !!restaurant.google_review_url &&
    (order.status === "served" || order.status === "billed") &&
    !ratingDismissed;

  const dismissRating = () => {
    localStorage.setItem(`sd-rated-${order.id}`, "1");
    setRatingDismissed(true);
  };

  async function requestBill() {
    setBillRequested(true);
    await supabase.rpc("request_bill", {
      p_qr_token: token,
      p_order_id: order.id,
      p_session_token: getSessionToken(token),
    });
  }

  if (cleared) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 grid size-16 place-items-center rounded-full bg-brand-50 text-brand-500">
          <Heart className="size-8" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Thanks for dining!
        </h1>
        <p className="mt-1.5 max-w-xs text-sm text-muted">
          Your table session has ended. We hope to see you again soon.
        </p>
      </div>
    );
  }

  const hero = HERO[order.status];
  const cur = statusIndex(order.status);
  const HeroIcon = hero.icon;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-40 md:max-w-2xl lg:max-w-4xl">
      {/* Hero */}
      <div className="bg-brand-500 px-5 pb-7 pt-6 text-white">
        <Link
          href={`/order/${token}`}
          className="mb-3 -ml-1 inline-flex items-center gap-1 rounded-pill px-1 py-0.5 text-xs font-medium text-white/85 active:scale-95"
        >
          <ArrowLeft className="size-4" />
          Back to menu
        </Link>
        <p className="text-xs font-medium text-white/80">
          Table {tableNumber} · placed {istTime(order.placed_at)}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full bg-white/15",
              order.status === "ready" && "animate-pulse-ring",
            )}
          >
            <HeroIcon className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight">
              {hero.title}
            </h1>
            <p className="text-sm text-white/85">{hero.sub}</p>
          </div>
        </div>
      </div>

      {/* Timeline + items — two-pane on desktop, stacked on mobile */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-8 lg:py-6">
        <ol className="px-6 py-6 lg:px-0 lg:py-0">
        {TIMELINE.map((stage, i) => {
          const idx = statusIndex(stage);
          const done = cur > idx;
          const active = cur === idx;
          return (
            <li key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    done
                      ? "border-success bg-success text-white"
                      : active
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-hairline bg-surface text-faint",
                  )}
                >
                  {done ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        active ? "animate-pulse bg-white" : "bg-faint",
                      )}
                    />
                  )}
                </span>
                {i < TIMELINE.length - 1 && (
                  <span
                    className={cn(
                      "my-1 w-0.5 flex-1 rounded-full",
                      done ? "bg-success" : "bg-hairline",
                      "min-h-6",
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "pt-1 text-[15px]",
                  active
                    ? "font-bold text-ink"
                    : done
                      ? "font-medium text-ink-soft"
                      : "text-faint",
                )}
              >
                {ORDER_STATUS_META[stage].label}
              </span>
            </li>
          );
        })}
      </ol>

        {/* Items */}
        <div className="mx-4 rounded-card border border-hairline/70 bg-surface p-4 lg:mx-0">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
          Your items
        </h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-sm">
              <span className="font-semibold tabular-nums text-ink">
                {it.quantity}×
              </span>
              <span className="flex-1 truncate text-ink-soft">{it.name}</span>
              <span
                className={cn(
                  "rounded-pill px-2 py-0.5 text-xs font-semibold capitalize",
                  it.status === "ready"
                    ? "bg-success-soft text-success-strong"
                    : it.status === "cooking"
                      ? "bg-warning-soft text-warning-strong"
                      : "bg-surface-sunken text-muted",
                )}
              >
                {it.status}
              </span>
            </li>
          ))}
        </ul>
        {order.table_note && (
          <p className="mt-3 border-t border-hairline pt-2 text-xs italic text-muted">
            Note: “{order.table_note}”
          </p>
        )}
        </div>
      </div>

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-hairline bg-surface/95 px-4 pb-3 pt-3 backdrop-blur md:max-w-2xl lg:max-w-4xl">
        {cur < statusIndex("ready") ? (
          <Link
            href={`/order/${token}`}
            className={buttonVariants({ variant: "outline", size: "lg", fullWidth: true })}
          >
            <Plus className="size-4" />
            Add more items
          </Link>
        ) : order.status === "billed" ? (
          <Link
            href={`/order/${token}/bill`}
            className={buttonVariants({ size: "lg", fullWidth: true })}
          >
            <ReceiptText className="size-4" />
            View bill
          </Link>
        ) : billRequested ? (
          <p className="py-2 text-center text-sm font-medium text-success-strong">
            Bill requested — the staff will bring it over.
          </p>
        ) : (
          <Button fullWidth size="lg" onClick={requestBill}>
            <ReceiptText className="size-4" />
            Request bill
          </Button>
        )}
      </div>

      {/* Rating prompt */}
      {showRating && restaurant.google_review_url && (
        <RatingSheet
          url={restaurant.google_review_url}
          onClose={dismissRating}
        />
      )}
    </div>
  );
}

function RatingSheet({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-ink/40"
      />
      <div className="animate-slide-up absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-card bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center shadow-pop">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-surface-sunken text-muted active:scale-90"
        >
          <X className="size-4" />
        </button>
        <span className="mx-auto mb-3 flex w-fit items-center gap-0.5 text-warning">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-6 fill-current" />
          ))}
        </span>
        <h2 className="text-xl font-bold tracking-tight text-ink">
          Enjoying your meal?
        </h2>
        <p className="mt-1 text-sm text-muted">
          A quick rating on Google means the world to a small café.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className={buttonVariants({ size: "lg", fullWidth: true, className: "mt-5" })}
        >
          <Star className="size-4 fill-current" />
          Rate us on Google
        </a>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-sm font-medium text-muted"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
