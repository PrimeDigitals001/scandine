import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** A CTA — usually a <Button/>. */
  action?: React.ReactNode;
  /** Use the danger palette for error states. */
  tone?: "neutral" | "danger";
}

/** The one component for every empty / error state. No screen ships without one. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {Icon && (
        <span
          className={cn(
            "mb-4 inline-flex size-14 items-center justify-center rounded-full",
            tone === "danger"
              ? "bg-danger-soft text-danger"
              : "bg-surface-sunken text-muted",
          )}
        >
          <Icon className="size-7" aria-hidden="true" />
        </span>
      )}
      <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
