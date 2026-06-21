"use client";

// Food-court cart — SEPARATE from the single-café useCart so a customer can hold
// live carts at several stores at once (single-café store is untouched). Carts
// are a map keyed by `${courtToken}|${storeSlug}`; each key is its own line list.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartLine, NewLine } from "@/lib/cart/store";

export const fcCartKey = (courtToken: string, storeSlug: string) =>
  `${courtToken}|${storeSlug}`;

function lineKey(l: NewLine): string {
  const v = l.variant?.name ?? "";
  const a = l.addons.map((x) => x.name).sort().join(",");
  const n = (l.note ?? "").trim();
  return `${l.menuItemId}|${v}|${a}|${n}`;
}

interface FcCartState {
  carts: Record<string, CartLine[]>;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  addLine: (cartKey: string, line: NewLine) => void;
  setQty: (cartKey: string, key: string, qty: number) => void;
  clear: (cartKey: string) => void;
}

export const useFcCart = create<FcCartState>()(
  persist(
    (set, get) => ({
      carts: {},
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      addLine: (cartKey, line) => {
        const key = lineKey(line);
        const cur = [...(get().carts[cartKey] ?? [])];
        const i = cur.findIndex((l) => l.key === key);
        const qty = line.quantity ?? 1;
        if (i >= 0) cur[i] = { ...cur[i], quantity: cur[i].quantity + qty };
        else cur.push({ ...line, key, quantity: qty });
        set({ carts: { ...get().carts, [cartKey]: cur } });
      },
      setQty: (cartKey, key, qty) => {
        const cur = (get().carts[cartKey] ?? []).flatMap((l) =>
          l.key !== key ? [l] : qty <= 0 ? [] : [{ ...l, quantity: qty }],
        );
        set({ carts: { ...get().carts, [cartKey]: cur } });
      },
      clear: (cartKey) =>
        set({ carts: { ...get().carts, [cartKey]: [] } }),
    }),
    {
      name: "scandine-fc-cart",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return {
          getItem: (k) => {
            try {
              return window.localStorage.getItem(k);
            } catch {
              return null;
            }
          },
          setItem: (k, v) => {
            try {
              window.localStorage.setItem(k, v);
            } catch {
              /* ignore */
            }
          },
          removeItem: (k) => {
            try {
              window.localStorage.removeItem(k);
            } catch {
              /* ignore */
            }
          },
        };
      }),
      skipHydration: true,
      partialize: (s) => ({ carts: s.carts }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

// Stable empty reference so the selector doesn't return a fresh [] each render
// (which would make zustand re-render forever).
const EMPTY: CartLine[] = [];
export const fcLines = (s: FcCartState, cartKey: string): CartLine[] =>
  s.carts[cartKey] ?? EMPTY;
export const fcCount = (lines: CartLine[]) =>
  lines.reduce((a, l) => a + l.quantity, 0);
export const fcSubtotal = (lines: CartLine[]) =>
  lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
