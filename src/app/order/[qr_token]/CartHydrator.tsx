"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart/store";

/**
 * Rehydrates the persisted cart AFTER mount (the store uses skipHydration).
 * This keeps the first client render identical to the server HTML, so React
 * hydrates cleanly and every button is interactive. Renders nothing.
 */
export function CartHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate();
  }, []);
  return null;
}
