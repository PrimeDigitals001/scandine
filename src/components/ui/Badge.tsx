import * as React from "react";
import { cn } from "@/lib/cn";

type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "danger"
  | "warning"
  | "info";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Render a leading status dot. */
  dot?: boolean;
}

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-soft text-success-strong",
  danger: "bg-danger-soft text-danger-strong",
  warning: "bg-warning-soft text-warning-strong",
  info: "bg-info-soft text-info",
};

const dotColors: Record<BadgeTone, string> = {
  neutral: "bg-muted",
  brand: "bg-brand-500",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

export function Badge({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold leading-none tracking-tight",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("size-1.5 rounded-full", dotColors[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
