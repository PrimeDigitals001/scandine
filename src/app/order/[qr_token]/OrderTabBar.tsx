"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UtensilsCrossed,
  ClipboardList,
  ReceiptText,
  Star,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Persistent bottom navigation for the customer flow, so a diner can always
 * jump between the menu, their live order, and the bill (no dead-ends).
 */
export function OrderTabBar({ token }: { token: string }) {
  const pathname = usePathname();
  const base = `/order/${token}`;

  const tabs = [
    {
      href: base,
      label: "Menu",
      icon: UtensilsCrossed,
      active: pathname === base || pathname === `${base}/cart`,
    },
    {
      href: `${base}/status`,
      label: "Order",
      icon: ClipboardList,
      active: pathname.startsWith(`${base}/status`),
    },
    {
      href: `${base}/bill`,
      label: "Bill",
      icon: ReceiptText,
      active: pathname.startsWith(`${base}/bill`),
    },
    {
      href: `${base}/feedback`,
      label: "Feedback",
      icon: Star,
      active: pathname.startsWith(`${base}/feedback`),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch md:max-w-2xl">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs font-medium transition-colors active:scale-95",
              t.active ? "text-brand-600" : "text-muted hover:text-ink",
            )}
          >
            <t.icon className="size-5" />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
