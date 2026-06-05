"use client";

import * as React from "react";
import Link from "next/link";
import { ShoppingBag, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import {
  useCart,
  selectCount,
  selectSubtotal,
  type CartLine,
} from "@/lib/cart/store";
import type { MenuItem, ResolveResult } from "@/lib/customer/types";
import { VegDot } from "@/components/ui/VegDot";
import { PriceTag } from "@/components/ui/PriceTag";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Pill } from "@/components/ui/Pill";
import { buttonVariants } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ItemSheet } from "./ItemSheet";

const GRADIENTS = [
  "from-brand-100 to-brand-200",
  "from-amber-100 to-orange-100",
  "from-rose-100 to-orange-100",
  "from-emerald-100 to-teal-100",
  "from-yellow-100 to-amber-100",
];

function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
}

const hasOptions = (item: MenuItem) =>
  item.variants.length > 0 || item.addons.length > 0;

export function MenuScreen({
  token,
  data,
}: {
  token: string;
  data: ResolveResult;
}) {
  const { restaurant, table, menu, active_order } = data;
  const ensureToken = useCart((s) => s.ensureToken);
  const lines = useCart((s) => s.lines);
  const hydrated = useCart((s) => s.hydrated);
  const addLine = useCart((s) => s.addLine);
  const setQty = useCart((s) => s.setQty);
  const count = useCart(selectCount);
  const subtotal = useCart(selectSubtotal);

  const [activeCat, setActiveCat] = React.useState<string>("all");
  const [sheetItem, setSheetItem] = React.useState<MenuItem | null>(null);

  React.useEffect(() => {
    ensureToken(token);
  }, [ensureToken, token]);

  const visibleCats = menu.filter(
    (c) => activeCat === "all" || c.id === activeCat,
  );

  // qty of an item's plain (no-options) line
  const baseQty = (id: string) =>
    lines.find((l) => l.key === `${id}|||`)?.quantity ?? 0;
  // total qty across all configured lines of an item (for the "Add" badge)
  const itemQty = (id: string) =>
    lines.filter((l) => l.menuItemId === id).reduce((a, l) => a + l.quantity, 0);

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-md pb-20 md:max-w-2xl lg:max-w-7xl",
        hydrated && count > 0 && "max-lg:pb-36",
      )}
    >
      {/* Header */}
      <header className="bg-brand-500 px-4 pb-5 pt-6 text-white md:px-6 lg:px-8">
        <p className="text-xs font-medium text-white/80">
          Table {table.table_number} · {table.capacity} seats · Dine-in
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
          {restaurant.name}
        </h1>
      </header>

      {/* Active order banner */}
      {active_order && (
        <Link
          href={`/order/${token}/status`}
          className="flex items-center gap-3 border-b border-hairline bg-brand-50 px-4 py-3 md:px-6 lg:px-8"
        >
          <span className="flex-1">
            <span className="text-sm font-semibold text-ink">
              You have an active order
            </span>
            <span className="mt-0.5 block">
              <StatusChip status={active_order.status} live />
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-medium text-brand-700">
            Track <ChevronRight className="size-4" />
          </span>
        </Link>
      )}

      {/* Two-pane on desktop: menu (left) + live cart panel (right) */}
      <div className="lg:flex lg:items-start lg:gap-8 lg:px-8">
        <main className="min-w-0 lg:flex-1">
          {/* Category filter (sticky) */}
          <div className="sticky top-0 z-10 border-b border-hairline bg-canvas/90 backdrop-blur lg:border-b-0">
            <div className="flex gap-2 overflow-x-auto px-4 py-3 md:px-6 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Pill active={activeCat === "all"} onClick={() => setActiveCat("all")}>
                All
              </Pill>
              {menu.map((c) => (
                <Pill
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                >
                  {c.name}
                </Pill>
              ))}
            </div>
          </div>

          {/* Menu */}
          <div className="flex flex-col gap-6 px-4 py-5 md:px-6 lg:px-0">
            {visibleCats.map((cat) => (
              <section key={cat.id}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                  {cat.name}
                </h2>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))]">
                  {cat.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      baseQty={baseQty(item.id)}
                      itemQty={itemQty(item.id)}
                      onQuickAdd={() =>
                        addLine({
                          menuItemId: item.id,
                          name: item.name,
                          isVeg: item.is_veg,
                          unitPrice: item.price,
                          variant: null,
                          addons: [],
                          note: null,
                        })
                      }
                      onStep={(n) => setQty(`${item.id}|||`, n)}
                      onCustomise={() => setSheetItem(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>

        {/* Desktop cart panel (replaces the mobile cart bar) */}
        <aside className="sticky top-4 hidden self-start py-5 lg:block lg:w-80 lg:shrink-0">
          <CartPanel token={token} lines={lines} subtotal={subtotal} setQty={setQty} />
        </aside>
      </div>

      {/* Mobile cart bar — sits above the tab bar */}
      {hydrated && count > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md px-4 pb-2 md:max-w-2xl md:px-6 lg:hidden">
          <Link
            href={`/order/${token}/cart`}
            className="animate-slide-up flex items-center justify-between gap-3 rounded-card bg-ink px-4 py-3 text-white shadow-pop active:scale-[0.99]"
          >
            <span className="flex items-center gap-2">
              <span
                key={count}
                className="animate-bump grid size-7 place-items-center rounded-full bg-brand-500 text-sm font-bold tabular-nums"
              >
                {count}
              </span>
              <span className="text-sm font-medium">
                {count === 1 ? "item" : "items"} ·{" "}
                <span className="tabular-nums">{formatINR(subtotal)}</span>
              </span>
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <ShoppingBag className="size-4" />
              View cart
            </span>
          </Link>
        </div>
      )}

      {sheetItem && (
        <ItemSheet item={sheetItem} onClose={() => setSheetItem(null)} />
      )}
    </div>
  );
}

function CartPanel({
  token,
  lines,
  subtotal,
  setQty,
}: {
  token: string;
  lines: CartLine[];
  subtotal: number;
  setQty: (key: string, qty: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-hairline/70 bg-surface shadow-card">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="font-bold tracking-tight text-ink">Your order</h2>
      </div>
      {lines.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm leading-relaxed text-muted">
          Your cart is empty.
          <br />
          Add items to get started.
        </p>
      ) : (
        <>
          <ul className="max-h-[46vh] divide-y divide-hairline overflow-y-auto px-4">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{l.name}</p>
                  {(l.variant || l.addons.length > 0) && (
                    <p className="truncate text-xs text-muted">
                      {[l.variant?.name, ...l.addons.map((a) => a.name)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <QtyStepper
                  size="sm"
                  value={l.quantity}
                  min={0}
                  onChange={(n) => setQty(l.key, n)}
                  label={l.name}
                />
              </li>
            ))}
          </ul>
          <div className="border-t border-hairline px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted">Subtotal</span>
              <PriceTag amount={subtotal} size="lg" />
            </div>
            <Link
              href={`/order/${token}/cart`}
              className={buttonVariants({ size: "lg", fullWidth: true })}
            >
              <ShoppingBag className="size-4" />
              Review &amp; order
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function ItemCard({
  item,
  baseQty,
  itemQty,
  onQuickAdd,
  onStep,
  onCustomise,
}: {
  item: MenuItem;
  baseQty: number;
  itemQty: number;
  onQuickAdd: () => void;
  onStep: (n: number) => void;
  onCustomise: () => void;
}) {
  const customisable = hasOptions(item);
  const showFrom = item.variants.length > 0;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-card border border-hairline/70 bg-surface p-3",
        !item.is_available && "opacity-60",
      )}
    >
      <div
        className={cn(
          "grid size-20 shrink-0 place-items-center rounded-card bg-gradient-to-br text-2xl font-bold text-brand-300",
          gradientFor(item.id),
        )}
        aria-hidden="true"
      >
        {item.name.charAt(0)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <VegDot veg={item.is_veg} size={13} />
          <h3 className="truncate text-sm font-semibold tracking-tight text-ink">
            {item.name}
          </h3>
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
            {item.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-1 pt-1.5">
          {showFrom && <span className="text-xs text-muted">from</span>}
          <PriceTag amount={item.price} size="sm" />
        </div>
      </div>

      <div className="flex shrink-0 items-end">
        {!item.is_available ? (
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-muted">
            Sold out
          </span>
        ) : customisable ? (
          <button
            type="button"
            onClick={onCustomise}
            className="relative inline-flex h-9 items-center gap-1 rounded-control border border-brand-200 bg-brand-50 px-3.5 text-sm font-semibold text-brand-600 transition active:scale-95"
          >
            <Plus className="size-4" />
            Add
            {itemQty > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white tabular-nums">
                {itemQty}
              </span>
            )}
          </button>
        ) : baseQty === 0 ? (
          <button
            type="button"
            onClick={onQuickAdd}
            className="inline-flex h-9 items-center gap-1 rounded-control border border-brand-200 bg-brand-50 px-3.5 text-sm font-semibold text-brand-600 transition active:scale-95"
          >
            <Plus className="size-4" />
            Add
          </button>
        ) : (
          <QtyStepper size="sm" value={baseQty} onChange={onStep} label={item.name} />
        )}
      </div>
    </div>
  );
}
