"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";

const links = [
  { href: "/admin/dashboard", label: "Floor", icon: LayoutDashboard },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  { href: "/admin/menu", label: "Menu", icon: BookOpen },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminTopBar({
  restaurantName,
  signOut,
}: {
  restaurantName: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-control bg-brand-500 text-white">
            <LayoutDashboard className="size-4" />
          </span>
          <span className="truncate text-sm font-bold tracking-tight text-ink">
            {restaurantName}
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(l.href)
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-canvas",
              )}
            >
              <l.icon className="size-4" />
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="hidden sm:block">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-danger"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>

        {/* Mobile: animated hamburger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-control text-ink active:scale-90 sm:hidden"
        >
          <span className="relative block h-4 w-5">
            <span
              className={cn(
                "absolute left-0 h-0.5 w-5 rounded-full bg-ink transition-all duration-300 ease-out",
                open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-1/2 h-0.5 w-5 -translate-y-1/2 rounded-full bg-ink transition-all duration-200 ease-out",
                open ? "opacity-0" : "opacity-100",
              )}
            />
            <span
              className={cn(
                "absolute left-0 h-0.5 w-5 rounded-full bg-ink transition-all duration-300 ease-out",
                open ? "bottom-1/2 translate-y-1/2 -rotate-45" : "bottom-0",
              )}
            />
          </span>
        </button>
      </div>

      {/* Mobile menu (animated slide-down) */}
      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-out sm:hidden",
          open ? "max-h-80 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <nav className="flex flex-col gap-1 border-t border-hairline px-3 py-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-control px-3 py-2.5 text-[15px] font-medium transition-colors",
                isActive(l.href)
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-canvas",
              )}
            >
              <l.icon className="size-5" />
              {l.label}
            </Link>
          ))}
          <form action={signOut} className="mt-1 border-t border-hairline pt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-[15px] font-medium text-danger transition-colors hover:bg-danger-soft"
            >
              <LogOut className="size-5" />
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
