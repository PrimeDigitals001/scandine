"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat,
  Volume2,
  VolumeX,
  LogOut,
  CheckCircle2,
  Soup,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OrderStatus } from "@/lib/orderStatus";

const ORDER_SELECT =
  "id, status, table_note, placed_at, tables(table_number), order_items(id, name_snapshot, quantity, addons, variant, item_note, status)";
const ACTIVE_STATUSES = ["placed", "accepted", "cooking", "ready", "served"];

export interface KdsItem {
  id: string;
  name_snapshot: string;
  quantity: number;
  addons: { name: string; price: number }[];
  variant: { name: string } | null;
  item_note: string | null;
  status: "pending" | "cooking" | "ready";
}
export interface KdsOrder {
  id: string;
  status: OrderStatus;
  table_note: string | null;
  placed_at: string;
  tables: { table_number: string } | null;
  order_items: KdsItem[];
}

const NEXT_ACTION: Partial<
  Record<OrderStatus, { label: string; to: OrderStatus; variant: ButtonProps["variant"] }>
> = {
  placed: { label: "Accept order", to: "accepted", variant: "dark" },
  accepted: { label: "Start cooking", to: "cooking", variant: "primary" },
  cooking: { label: "Mark ready", to: "ready", variant: "success" },
  ready: { label: "Mark served", to: "served", variant: "success" },
};

const ITEM_CYCLE = ["pending", "cooking", "ready"] as const;

function istTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KDSBoard({
  restaurantId,
  restaurantName,
  initialOrders,
}: {
  restaurantId: string;
  restaurantName: string;
  initialOrders: KdsOrder[];
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [orders, setOrders] = React.useState<KdsOrder[]>(initialOrders);
  const [soundOn, setSoundOn] = React.useState(false);
  const [now, setNow] = React.useState(0);

  const soundRef = React.useRef(false);
  const audioCtx = React.useRef<AudioContext | null>(null);
  const knownIds = React.useRef<Set<string>>(
    new Set(initialOrders.map((o) => o.id)),
  );

  const beep = React.useCallback(() => {
    if (!soundRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = audioCtx.current ?? new Ctx();
      audioCtx.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.36);
    } catch {
      /* audio blocked — ignore */
    }
  }, []);

  const loadOrders = React.useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .in("status", ACTIVE_STATUSES)
      .order("placed_at", { ascending: true });
    const list = (data ?? []) as unknown as KdsOrder[];
    const hasNew = list.some(
      (o) => o.status === "placed" && !knownIds.current.has(o.id),
    );
    list.forEach((o) => knownIds.current.add(o.id));
    if (hasNew) beep();
    setOrders(list);
  }, [supabase, beep]);

  // Live: any order / item change for this restaurant refreshes the board.
  React.useEffect(() => {
    const channel = supabase
      .channel(`kds-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          loadOrders();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          loadOrders();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId, loadOrders]);

  // Clock for "x min ago" — set off the effect body (avoids sync setState).
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setTimeout(tick, 0);
    const id = setInterval(tick, 20000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current = next;
    if (next) beep(); // also unlocks the AudioContext via this click gesture
  }

  async function advance(order: KdsOrder) {
    const action = NEXT_ACTION[order.status];
    if (!action) return;
    const patch: Record<string, unknown> = { status: action.to };
    if (action.to === "served") patch.served_at = new Date().toISOString();
    await supabase.from("orders").update(patch).eq("id", order.id);
    if (action.to === "cooking")
      await supabase.from("order_items").update({ status: "cooking" }).eq("order_id", order.id);
    if (action.to === "ready")
      await supabase.from("order_items").update({ status: "ready" }).eq("order_id", order.id);
    loadOrders();
  }

  async function cycleItem(item: KdsItem) {
    const i = ITEM_CYCLE.indexOf(item.status);
    const next = ITEM_CYCLE[(i + 1) % ITEM_CYCLE.length];
    await supabase.from("order_items").update({ status: next }).eq("id", item.id);
    loadOrders();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const active = orders.filter((o) => o.status !== "served");
  const served = orders.filter((o) => o.status === "served");

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-control bg-ink text-white">
              <ChefHat className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-ink">Kitchen</p>
              <p className="text-xs text-muted">{restaurantName}</p>
            </div>
            <span className="ml-1 flex items-center gap-1.5 rounded-pill bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-strong">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Live
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-control border px-3 py-2 text-sm font-medium transition-colors active:scale-95",
                soundOn
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-hairline bg-surface text-muted",
              )}
            >
              {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              <span className="hidden sm:inline">{soundOn ? "Sound on" : "Sound off"}</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-danger active:scale-95"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {active.length === 0 && served.length === 0 ? (
          <EmptyState
            icon={Soup}
            title="No active orders"
            description="New orders will appear here the moment a customer places one. Turn on sound to get an alert."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((order) => (
                <Ticket
                  key={order.id}
                  order={order}
                  now={now}
                  onAdvance={() => advance(order)}
                  onCycleItem={cycleItem}
                />
              ))}
            </div>

            {served.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  Served · waiting to bill
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {served.map((order) => (
                    <Ticket
                      key={order.id}
                      order={order}
                      now={now}
                      onAdvance={() => {}}
                      onCycleItem={cycleItem}
                      dimmed
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Ticket({
  order,
  now,
  onAdvance,
  onCycleItem,
  dimmed,
}: {
  order: KdsOrder;
  now: number;
  onAdvance: () => void;
  onCycleItem: (item: KdsItem) => void;
  dimmed?: boolean;
}) {
  const action = NEXT_ACTION[order.status];
  const mins = now > 0 ? Math.max(0, Math.floor((now - new Date(order.placed_at).getTime()) / 60000)) : null;
  const urgent = mins !== null && mins >= 10 && order.status !== "served";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-card border bg-surface shadow-card",
        urgent ? "border-danger/50" : "border-hairline/70",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-ink">
            {order.tables?.table_number ?? "—"}
          </span>
          <StatusChip status={order.status} short live={!dimmed} />
        </div>
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            urgent ? "text-danger" : "text-muted",
          )}
        >
          {istTime(order.placed_at)}
          {mins !== null && ` · ${mins}m`}
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-2 px-4 py-3">
        {order.order_items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onCycleItem(it)}
              className="flex w-full items-start gap-2 rounded-control px-1 py-1 text-left transition-colors hover:bg-canvas active:scale-[0.99]"
            >
              <span className="text-base font-bold tabular-nums text-ink">
                {it.quantity}×
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{it.name_snapshot}</span>
                {(it.variant || it.addons.length > 0) && (
                  <span className="block text-xs text-muted">
                    {[it.variant?.name, ...it.addons.map((a) => a.name)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {it.item_note && (
                  <span className="block text-xs font-medium italic text-warning-strong">
                    “{it.item_note}”
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "mt-0.5 rounded-pill px-2 py-0.5 text-xs font-semibold capitalize",
                  it.status === "ready"
                    ? "bg-success-soft text-success-strong"
                    : it.status === "cooking"
                      ? "bg-warning-soft text-warning-strong"
                      : "bg-surface-sunken text-muted",
                )}
              >
                {it.status}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {order.table_note && (
        <p className="mx-4 mb-3 rounded-control bg-warning-soft px-3 py-2 text-xs font-medium text-warning-strong">
          Table note: {order.table_note}
        </p>
      )}

      <div className="border-t border-hairline p-3">
        {action ? (
          <Button variant={action.variant} size="lg" fullWidth onClick={onAdvance}>
            {action.label}
          </Button>
        ) : (
          <p className="flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-success-strong">
            <CheckCircle2 className="size-4" />
            Served
          </p>
        )}
      </div>
    </div>
  );
}
