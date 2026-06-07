"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { setAcceptingOrdersAction } from "@/lib/admin/actions";

/**
 * Owner's open/closed switch. While off, the customer PWA shows a "closed"
 * notice and the server rejects place_order / add_items — so a scan of the
 * permanent QR can't drop an order outside business hours.
 */
export function OpenToggle({ accepting }: { accepting: boolean }) {
  return (
    <form action={setAcceptingOrdersAction}>
      <input type="hidden" name="accepting" value={(!accepting).toString()} />
      <ToggleButton accepting={accepting} />
    </form>
  );
}

function ToggleButton({ accepting }: { accepting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={accepting ? "Tap to stop taking orders" : "Tap to start taking orders"}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-pill border px-3 py-2 text-sm font-semibold transition-colors active:scale-95 disabled:opacity-60",
        accepting
          ? "border-success/30 bg-success-soft text-success-strong"
          : "border-danger/30 bg-danger-soft text-danger-strong",
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          accepting ? "bg-success" : "bg-stone-300",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-white shadow transition-transform",
            accepting ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      {accepting ? "Open · taking orders" : "Closed · paused"}
    </button>
  );
}
