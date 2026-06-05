"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

type StepperSize = "sm" | "md";

export interface QtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: StepperSize;
  /** Accessible label, e.g. the item name ("Quantity for Nutella Brownie"). */
  label?: string;
  className?: string;
}

const dims: Record<StepperSize, { btn: string; icon: string; num: string }> = {
  sm: { btn: "size-8", icon: "size-4", num: "w-7 text-sm" },
  md: { btn: "size-10", icon: "size-[18px]", num: "w-9 text-base" },
};

/** Circular ± stepper matching the reference menus. Controlled. */
export function QtyStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = "md",
  label = "Quantity",
  className,
}: QtyStepperProps) {
  const d = dims[size];
  const atMin = value <= min;
  const atMax = value >= max;

  const btn =
    "inline-flex items-center justify-center rounded-full border border-hairline bg-surface text-ink " +
    "transition-[transform,background-color,border-color,color] duration-150 ease-out " +
    "hover:border-brand-300 hover:text-brand-600 active:scale-90 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas " +
    "disabled:pointer-events-none disabled:opacity-35";

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={cn(btn, d.btn)}
        onClick={() => onChange(value - 1)}
        disabled={atMin}
        aria-label="Decrease quantity"
      >
        <Minus className={d.icon} aria-hidden="true" />
      </button>
      <span
        className={cn(
          "text-center font-semibold tabular-nums text-ink",
          d.num,
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, d.btn)}
        onClick={() => onChange(value + 1)}
        disabled={atMax}
        aria-label="Increase quantity"
      >
        <Plus className={d.icon} aria-hidden="true" />
      </button>
    </div>
  );
}
