import * as React from "react";
import { cn } from "@/lib/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  circle?: boolean;
}

/**
 * Shimmer placeholder. Never show a bare spinner on the menu — compose these
 * into the real layout's shape so content settles without a jump.
 */
export function Skeleton({ className, circle, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton",
        circle ? "rounded-full" : "rounded-control",
        className,
      )}
      {...props}
    />
  );
}

/** A ready-made menu-item card skeleton — the shape the customer PWA loads into. */
export function MenuItemSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-card border border-hairline/70 bg-surface p-3",
        className,
      )}
    >
      <Skeleton className="size-20 shrink-0 rounded-card" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-auto h-5 w-16" />
      </div>
    </div>
  );
}
