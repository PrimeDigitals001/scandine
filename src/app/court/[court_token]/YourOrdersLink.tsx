"use client";

import * as React from "react";
import Link from "next/link";
import { Receipt, ChevronRight } from "lucide-react";
import { getCourtOrders } from "@/lib/customer/fcSession";

// Shows a "your orders" banner on the store list when the customer has placed at
// least one order in this court. Reads localStorage via useSyncExternalStore so
// SSR renders nothing (count 0) and the client fills in after hydration — no
// effect, no hydration mismatch.
const noopSubscribe = () => () => {};
export function YourOrdersLink({ token }: { token: string }) {
  const count = React.useSyncExternalStore(
    noopSubscribe,
    () => getCourtOrders(token).length,
    () => 0,
  );

  if (count === 0) return null;
  return (
    <Link
      href={`/court/${token}/orders`}
      className="mb-4 flex items-center gap-3 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 transition active:scale-[0.99]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
        <Receipt className="size-4" />
      </span>
      <span className="flex-1 text-sm font-semibold text-ink">
        Your orders ({count}) — track them here
      </span>
      <ChevronRight className="size-5 text-brand-600" />
    </Link>
  );
}
