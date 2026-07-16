"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/prospeccao", label: "Prospecção" },
  { href: "/rascunhos", label: "Rascunhos" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-500 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
