"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Receipt, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the owner's Floor / Billing screens live: subscribes to this
 * restaurant's orders, tables, and bills and refreshes the server data on any
 * change. When a customer taps "Request bill" (table → billing) it also pops a
 * dismissible alert so the owner notices immediately.
 */
export function AdminLive({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [alert, setAlert] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    const filter = `restaurant_id=eq.${restaurantId}`;

    // `orders` is anon-readable, so its realtime stream is reliable (same one
    // the customer + kitchen use). Any order change → re-fetch the screen; a
    // newly stamped bill_requested_at → pop the "requested the bill" alert.
    const channel = supabase
      .channel(`admin-live-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter },
        (payload) => {
          const next = payload.new as { bill_requested_at?: string | null } | null;
          const prev = payload.old as { bill_requested_at?: string | null } | null;
          if (next?.bill_requested_at && next.bill_requested_at !== prev?.bill_requested_at) {
            setAlert(true);
          }
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  React.useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(false), 8000);
    return () => clearTimeout(t);
  }, [alert]);

  if (!alert) return null;
  return (
    <div
      role="status"
      className="animate-slide-up fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[min(92%,28rem)] items-center gap-3 rounded-card bg-ink px-4 py-3 text-white shadow-pop"
    >
      <Receipt className="size-5 shrink-0 text-brand-300" />
      <span className="flex-1 text-sm font-medium">
        A table requested the bill — open <span className="font-bold">Billing</span>.
      </span>
      <button
        type="button"
        onClick={() => setAlert(false)}
        aria-label="Dismiss"
        className="grid size-7 shrink-0 place-items-center rounded-control text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
