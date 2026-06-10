"use client";

import { BarChart3, BellRing, Home, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/#market", label: "Market", icon: BarChart3 },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/notifications", label: "Alerts", icon: BellRing }
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-[0_-8px_24px_rgba(29,36,51,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/" ? pathname === "/" : item.href.startsWith("/#") ? false : pathname.startsWith(item.href);

          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold ${
                isActive ? "bg-ink text-white" : "text-ink/65 active:bg-paper"
              }`}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
