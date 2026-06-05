import * as React from "react";
import { cn } from "@/lib/cn";

export interface VegDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  veg: boolean;
  /** Square edge length in px (FSSAI mark is a square with a centred dot). */
  size?: number;
}

/**
 * FSSAI veg / non-veg indicator: a coloured square outline with a filled
 * circle inside. Green = veg, brown = non-veg. Mandatory on Indian menus.
 */
export function VegDot({ veg, size = 16, className, ...props }: VegDotProps) {
  const color = veg ? "var(--color-veg)" : "var(--color-nonveg)";
  return (
    <span
      role="img"
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
      className={cn("inline-flex items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.18),
        border: `2px solid ${color}`,
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className="rounded-full"
        style={{
          width: size * 0.46,
          height: size * 0.46,
          background: color,
        }}
      />
    </span>
  );
}
