import * as React from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a hover-lift + deeper shadow. Use for tappable/linked cards. */
  interactive?: boolean;
  /** Drop the default padding (e.g. cards with full-bleed photography). */
  flush?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, flush, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-hairline/70 bg-surface shadow-card",
        !flush && "p-4",
        interactive &&
          "cursor-pointer transition-[transform,box-shadow] duration-200 ease-out " +
            "hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0 active:shadow-card",
        className,
      )}
      {...props}
    />
  );
});
