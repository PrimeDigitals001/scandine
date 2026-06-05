import * as React from "react";
import { cn } from "@/lib/cn";
import {
  ORDER_STATUS_META,
  type OrderStatus,
} from "@/lib/orderStatus";

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: OrderStatus;
  /** Use the short label (dense KDS / floor chips). */
  short?: boolean;
  /** Pulsing dot for the order's *current* live stage. */
  live?: boolean;
}

/*
  Full, static class strings per status so Tailwind v4's content scanner emits
  them (dynamic `bg-status-${x}` would be purged). Tints use the /12 modifier.
*/
const chipColors: Record<OrderStatus, string> = {
  placed: "bg-status-placed/12 text-status-placed",
  accepted: "bg-status-accepted/12 text-status-accepted",
  cooking: "bg-status-cooking/15 text-warning-strong",
  ready: "bg-status-ready/12 text-success-strong",
  served: "bg-status-served/12 text-status-served",
  billed: "bg-status-billed/12 text-status-billed",
  cleared: "bg-status-cleared/15 text-muted",
};

const dotColors: Record<OrderStatus, string> = {
  placed: "bg-status-placed",
  accepted: "bg-status-accepted",
  cooking: "bg-status-cooking",
  ready: "bg-status-ready",
  served: "bg-status-served",
  billed: "bg-status-billed",
  cleared: "bg-status-cleared",
};

export function StatusChip({
  status,
  short = false,
  live = false,
  className,
  ...props
}: StatusChipProps) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold leading-none tracking-tight",
        chipColors[status],
        className,
      )}
      {...props}
    >
      <span className="relative flex size-2">
        {live && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              dotColors[status],
            )}
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            dotColors[status],
          )}
          aria-hidden="true"
        />
      </span>
      {short ? meta.short : meta.label}
    </span>
  );
}
