"use client";

import * as React from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PriceTag } from "@/components/ui/PriceTag";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { VegDot } from "@/components/ui/VegDot";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";

interface DemoItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  veg: boolean;
  emoji: string;
  swatch: string;
}

const ITEMS: DemoItem[] = [
  {
    id: "brownie",
    name: "Nutella Brownie",
    desc: "Warm, fudgy, OREO crumble",
    price: 150,
    veg: true,
    emoji: "🍫",
    swatch: "from-brand-100 to-brand-200",
  },
  {
    id: "chai",
    name: "Kullad Masala Chai",
    desc: "Slow-brewed, clay cup",
    price: 40,
    veg: true,
    emoji: "🍵",
    swatch: "from-amber-100 to-orange-100",
  },
  {
    id: "sandwich",
    name: "Peri-Peri Chicken Club",
    desc: "Triple-stack, hand-cut fries",
    price: 180,
    veg: false,
    emoji: "🥪",
    swatch: "from-stone-100 to-amber-100",
  },
];

/**
 * Live, interactive slice of the customer PWA — the design system in motion:
 * circular steppers, green money, the cart bar sliding up on first add.
 */
export function HeroDemo() {
  const [qty, setQty] = React.useState<Record<string, number>>({});

  const setItem = (id: string, next: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, next) }));

  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = ITEMS.reduce((sum, it) => sum + (qty[it.id] ?? 0) * it.price, 0);

  return (
    <div className="relative w-full max-w-sm">
      {/* Phone-ish framed menu */}
      <div className="overflow-hidden rounded-card border border-hairline/70 bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-hairline bg-canvas/60 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-muted">Table T4 · 4 seats</p>
            <p className="text-sm font-semibold tracking-tight text-ink">
              Friends &amp; Fries Café
            </p>
          </div>
          <span className="rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
            Dine-in
          </span>
        </div>

        <div className="divide-y divide-hairline">
          {ITEMS.map((it) => {
            const q = qty[it.id] ?? 0;
            return (
              <div key={it.id} className="flex items-center gap-3 p-3">
                <div
                  className={cn(
                    "grid size-16 shrink-0 place-items-center rounded-card bg-gradient-to-br text-3xl",
                    it.swatch,
                  )}
                  aria-hidden="true"
                >
                  {it.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <VegDot veg={it.veg} size={13} />
                    <p className="truncate text-sm font-semibold tracking-tight text-ink">
                      {it.name}
                    </p>
                  </div>
                  <p className="truncate text-xs text-muted">{it.desc}</p>
                  <PriceTag amount={it.price} size="sm" className="mt-1" />
                </div>
                <div className="shrink-0">
                  {q === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setItem(it.id, 1)}
                      aria-label={`Add ${it.name}`}
                    >
                      Add
                    </Button>
                  ) : (
                    <QtyStepper
                      size="sm"
                      value={q}
                      onChange={(n) => setItem(it.id, n)}
                      label={`Quantity for ${it.name}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky cart bar — slides up the instant the cart is non-empty */}
        <div className="h-16">
          {count > 0 && (
            <div className="animate-slide-up sticky bottom-0 flex items-center justify-between gap-3 border-t border-hairline bg-surface px-4 py-3 shadow-sticky">
              <div className="flex items-center gap-2 text-sm">
                <span
                  key={count}
                  className="animate-bump grid size-6 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white tabular-nums"
                >
                  {count}
                </span>
                <span className="font-medium text-ink-soft">
                  {count === 1 ? "item" : "items"}
                </span>
              </div>
              <Button size="sm" leftIcon={<ShoppingBag className="size-4" />}>
                View cart · {formatINR(total)}
              </Button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        Live preview — tap <span className="font-semibold text-ink-soft">Add</span>.
        No spinners, no app install.
      </p>
    </div>
  );
}
