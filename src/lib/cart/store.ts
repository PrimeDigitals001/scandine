"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MenuAddon, MenuVariant } from "@/lib/customer/types";

export interface CartLine {
  key: string; // unique per item + options
  menuItemId: string;
  name: string;
  isVeg: boolean;
  unitPrice: number; // base + variant delta + add-ons, per unit
  quantity: number;
  variant: MenuVariant | null;
  addons: MenuAddon[];
  note: string | null;
}

export type NewLine = Omit<CartLine, "key" | "quantity"> & { quantity?: number };

interface CartState {
  token: string | null;
  lines: CartLine[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  /** Bind the cart to a table; resets if the token changed (new/cleared table). */
  ensureToken: (token: string) => void;
  addLine: (line: NewLine) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
}

function lineKey(l: {
  menuItemId: string;
  variant: MenuVariant | null;
  addons: MenuAddon[];
  note: string | null;
}): string {
  const v = l.variant?.name ?? "";
  const a = l.addons.map((x) => x.name).sort().join(",");
  const n = (l.note ?? "").trim();
  return `${l.menuItemId}|${v}|${a}|${n}`;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      token: null,
      lines: [],
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      ensureToken: (token) => {
        if (get().token !== token) set({ token, lines: [] });
      },
      addLine: (line) => {
        const key = lineKey(line);
        const lines = [...get().lines];
        const i = lines.findIndex((l) => l.key === key);
        const qty = line.quantity ?? 1;
        if (i >= 0) {
          lines[i] = { ...lines[i], quantity: lines[i].quantity + qty };
        } else {
          lines.push({ ...line, key, quantity: qty });
        }
        set({ lines });
      },
      setQty: (key, qty) =>
        set({
          lines: get().lines.flatMap((l) =>
            l.key !== key ? [l] : qty <= 0 ? [] : [{ ...l, quantity: qty }],
          ),
        }),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "scandine-cart",
      // Guard SSR: localStorage doesn't exist on the server. Return a no-op
      // StateStorage there so persist doesn't throw; the client uses the real one.
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        // Resilient: a blocked/private-mode localStorage must never break the
        // cart — it just won't persist across reloads.
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
      // Don't rehydrate during the initial (synchronous) client render — that
      // would mismatch the server HTML (which has an empty cart) and break
      // hydration/interactivity. We rehydrate after mount via <CartHydrator/>.
      skipHydration: true,
      partialize: (s) => ({ token: s.token, lines: s.lines }),
      // Call the setter (not a bare mutation) so subscribers actually re-render.
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export const selectCount = (s: CartState) =>
  s.lines.reduce((a, l) => a + l.quantity, 0);
export const selectSubtotal = (s: CartState) =>
  s.lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
