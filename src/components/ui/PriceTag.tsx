import * as React from "react";
import { cn } from "@/lib/cn";
import { formatINR, type FormatINROptions } from "@/lib/format";

type PriceSize = "sm" | "md" | "lg" | "xl";

export interface PriceTagProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  amount: number | string;
  size?: PriceSize;
  /** green money (default), neutral ink, or struck-through original price. */
  tone?: "money" | "ink" | "muted";
  /** Strike-through, for a pre-discount original price. */
  strike?: boolean;
  decimals?: FormatINROptions["decimals"];
}

const sizes: Record<PriceSize, string> = {
  sm: "text-sm",
  md: "text-[15px]",
  lg: "text-lg",
  xl: "text-2xl",
};

const tones = {
  money: "text-success",
  ink: "text-ink",
  muted: "text-muted",
} as const;

/** Prices/totals in success green, tabular figures so columns align. */
export function PriceTag({
  amount,
  size = "md",
  tone = "money",
  strike = false,
  decimals,
  className,
  ...props
}: PriceTagProps) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight tabular-nums",
        sizes[size],
        strike ? "text-muted line-through decoration-1" : tones[tone],
        className,
      )}
      {...props}
    >
      {formatINR(amount, { decimals })}
    </span>
  );
}
