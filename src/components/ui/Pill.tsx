import * as React from "react";
import { cn } from "@/lib/cn";

export interface PillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — ink fill, like the category filters in the references. */
  active?: boolean;
}

/**
 * Category / filter chip. Renders as a button so the whole row can be a
 * horizontally-scrolling, keyboard-navigable filter strip.
 */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { className, active = false, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill px-4 text-sm font-medium",
        "transition-[transform,background-color,color,border-color] duration-150 ease-out active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "bg-ink text-white"
          : "border border-hairline bg-surface text-ink-soft hover:bg-canvas",
        className,
      )}
      {...props}
    />
  );
});
