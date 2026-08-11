"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navegação em GRUPOS didáticos, na ordem do funil comercial:
//   1. Visão geral   → Dashboard
//   2. Captação      → Empresas, Médicos, Escolas (prospecção via Apollo)
//   3. Convênios     → Operadoras, Reajustes
//   4. Recorrente    → Agenda Aberta
//   5. Enviar        → Rascunhos (aprovar e disparar)
const GROUPS: { href: string; label: string }[][] = [
  [{ href: "/", label: "Dashboard" }],
  [
    { href: "/prospeccao", label: "Empresas" },
    { href: "/medicos", label: "Médicos" },
    { href: "/escolas", label: "Escolas" },
    { href: "/igrejas", label: "Igrejas" },
  ],
  [
    { href: "/operadoras", label: "Operadoras" },
    { href: "/reajustes", label: "Reajustes" },
  ],
  [{ href: "/agenda", label: "Agenda Aberta" }],
  [{ href: "/rascunhos", label: "Rascunhos" }],
];

export function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-2xl border border-brand-100 bg-white p-1.5 shadow-card">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {gi > 0 && (
            <span
              aria-hidden
              className="mx-1 hidden h-5 w-px bg-brand-100 sm:block"
            />
          )}
          {group.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-brand-600 text-white shadow-[0_4px_12px_-4px_rgba(38,44,102,0.5)]"
                    : "text-brand-800/70 hover:bg-brand-50 hover:text-brand-800"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
