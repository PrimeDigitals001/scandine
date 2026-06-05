"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Store } from "lucide-react";
import { cn } from "@/lib/cn";

const links = [
  { href: "/superadmin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/superadmin/restaurants", label: "Cafés", icon: Store },
];

export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active =
          pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas",
            )}
          >
            <l.icon className="size-4" />
            <span className="hidden sm:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
