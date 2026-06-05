import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type ButtonVariant =
  | "primary" // orange — the customer-flow CTA (Piringan/Burgenator)
  | "dark" // near-black pill — admin/POS CTA (Kans Resto)
  | "outline" // hairline border on surface
  | "ghost" // text-only, no chrome
  | "success" // green — confirm / pay
  | "danger"; // destructive

type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width — common for sticky mobile CTAs. */
  fullWidth?: boolean;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const base =
  "relative inline-flex select-none items-center justify-center gap-2 " +
  "rounded-control font-semibold tracking-tight whitespace-nowrap " +
  "transition-[transform,background-color,box-shadow,border-color,color] duration-150 ease-out " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white shadow-card hover:bg-brand-600 active:bg-brand-700",
  dark: "bg-ink text-white shadow-card hover:bg-ink-soft active:bg-black",
  outline:
    "border border-hairline bg-surface text-ink hover:bg-canvas active:bg-surface-sunken",
  ghost: "bg-transparent text-ink hover:bg-black/5 active:bg-black/10",
  success:
    "bg-success text-white shadow-card hover:bg-success-strong active:bg-success-strong",
  danger:
    "bg-danger text-white shadow-card hover:bg-danger-strong active:bg-danger-strong",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-6 text-base",
};

/**
 * The button's class string, exported so a <Link> can wear the same look
 * without nesting a <button> inside an <a> (invalid HTML). shadcn pattern.
 */
export function buttonVariants({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    base,
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonVariants({ variant, size, fullWidth, className })}
        {...props}
      >
        {loading && (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-2",
            loading && "opacity-0",
          )}
        >
          {leftIcon}
          {children}
          {rightIcon}
        </span>
      </button>
    );
  },
);
