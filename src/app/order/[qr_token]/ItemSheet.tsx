"use client";

import * as React from "react";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { useCart } from "@/lib/cart/store";
import type { MenuItem, MenuAddon, MenuVariant } from "@/lib/customer/types";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { VegDot } from "@/components/ui/VegDot";

export function ItemSheet({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const addLine = useCart((s) => s.addLine);
  const [variant, setVariant] = React.useState<MenuVariant | null>(
    item.variants[0] ?? null,
  );
  const [addons, setAddons] = React.useState<MenuAddon[]>([]);
  const [note, setNote] = React.useState("");
  const [qty, setQty] = React.useState(1);

  // Lock background scroll while the sheet is open.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const unitPrice =
    item.price +
    (variant?.price_delta ?? 0) +
    addons.reduce((a, x) => a + x.price, 0);

  const toggleAddon = (a: MenuAddon) =>
    setAddons((cur) =>
      cur.some((x) => x.name === a.name)
        ? cur.filter((x) => x.name !== a.name)
        : [...cur, a],
    );

  const confirm = () => {
    addLine({
      menuItemId: item.id,
      name: item.name,
      isVeg: item.is_veg,
      unitPrice,
      variant,
      addons,
      note: note.trim() || null,
      quantity: qty,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-ink/40"
      />
      <div className="animate-slide-up absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-card bg-surface shadow-pop md:max-w-lg">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <VegDot veg={item.is_veg} size={14} />
              <h2 className="truncate text-lg font-bold tracking-tight text-ink">
                {item.name}
              </h2>
            </div>
            {item.description && (
              <p className="mt-0.5 text-sm leading-relaxed text-muted">
                {item.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-muted active:scale-90"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* options */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {item.variants.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-ink">Choose one</h3>
              <div className="flex flex-col gap-2">
                {item.variants.map((v) => {
                  const selected = variant?.name === v.name;
                  return (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => setVariant(v)}
                      className={cn(
                        "flex items-center justify-between rounded-control border px-3.5 py-2.5 text-left transition",
                        selected
                          ? "border-brand-400 bg-brand-50"
                          : "border-hairline bg-surface",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "grid size-5 place-items-center rounded-full border-2",
                            selected
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-hairline",
                          )}
                        >
                          {selected && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {v.name}
                        </span>
                      </span>
                      {v.price_delta !== 0 && (
                        <span className="text-sm font-medium text-muted">
                          +{formatINR(v.price_delta, { decimals: false })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {item.addons.length > 0 && (
            <section className="mb-2">
              <h3 className="mb-2 text-sm font-semibold text-ink">
                Add-ons{" "}
                <span className="font-normal text-muted">· optional</span>
              </h3>
              <div className="flex flex-col gap-2">
                {item.addons.map((a) => {
                  const selected = addons.some((x) => x.name === a.name);
                  return (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => toggleAddon(a)}
                      className={cn(
                        "flex items-center justify-between rounded-control border px-3.5 py-2.5 text-left transition",
                        selected
                          ? "border-brand-400 bg-brand-50"
                          : "border-hairline bg-surface",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "grid size-5 place-items-center rounded-md border-2",
                            selected
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-hairline",
                          )}
                        >
                          {selected && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {a.name}
                        </span>
                      </span>
                      <span className="text-sm font-medium text-muted">
                        +{formatINR(a.price, { decimals: false })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-ink">
              Note for the kitchen{" "}
              <span className="font-normal text-muted">· optional</span>
            </h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={140}
              placeholder="e.g. less sugar, no onions"
              className="min-h-16 w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/35"
            />
          </section>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 border-t border-hairline px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} />
          <Button onClick={confirm} fullWidth size="lg">
            Add · {formatINR(unitPrice * qty)}
          </Button>
        </div>
      </div>
    </div>
  );
}
