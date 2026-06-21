"use client";

import { useEffect } from "react";
import { useFcCart } from "@/lib/cart/fcStore";

// Rehydrate the food-court cart after mount (skipHydration avoids an SSR
// mismatch), mirroring the single-café CartHydrator.
export function FcCartHydrator() {
  useEffect(() => {
    void useFcCart.persist.rehydrate();
  }, []);
  return null;
}
