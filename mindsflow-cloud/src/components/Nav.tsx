"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/dashboard", label: "Painel" },
  { href: "/organizacao", label: "Organização" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {ITENS.map((item) => {
        const ativo =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              ativo
                ? "rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-card"
                : "rounded-xl border border-brand-100 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
