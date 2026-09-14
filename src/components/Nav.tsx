"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRANDS, DEFAULT_BRAND, type BrandId } from "@/lib/brands";

function lerMarcaCookie(): BrandId {
  if (typeof document === "undefined") return DEFAULT_BRAND;
  const m = document.cookie.match(/(?:^|;\s*)marca=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v === "therapy_minds" || v === "menthalhelp" ? v : DEFAULT_BRAND;
}

// Seletor de MARCA ATIVA. Grava o cookie `marca` (o servidor lê em toda chamada)
// e recarrega para as listas/prospecção/envio passarem a operar naquela marca.
function BrandSwitcher() {
  const [marca, setMarca] = useState<BrandId>(DEFAULT_BRAND);
  useEffect(() => setMarca(lerMarcaCookie()), []);

  function trocar(b: BrandId) {
    if (b === marca) return;
    document.cookie = `marca=${b}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setMarca(b);
    window.location.reload();
  }

  return (
    <div
      className="ml-auto flex items-center gap-1 rounded-xl border border-brand-100 bg-brand-50/60 p-0.5"
      title="Marca ativa — define a base, o remetente e a assinatura"
    >
      {(Object.keys(BRANDS) as BrandId[]).map((b) => {
        const ativo = marca === b;
        return (
          <button
            key={b}
            type="button"
            onClick={() => trocar(b)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
              ativo ? "text-white shadow-sm" : "text-brand-800/60 hover:text-brand-800"
            }`}
            style={ativo ? { backgroundColor: BRANDS[b].accent } : undefined}
          >
            {BRANDS[b].short}
          </button>
        );
      })}
    </div>
  );
}

// Navegação em GRUPOS didáticos, na ordem do funil comercial:
//   1. Visão geral   → Dashboard
//   2. Captação      → Empresas, Médicos, Escolas (prospecção via Apollo)
//   3. Convênios     → Operadoras, Reajustes
//   4. Recorrente    → Agenda Aberta
//   5. Enviar        → Rascunhos (aprovar e disparar)
const GROUPS: { href: string; label: string }[][] = [
  [
    { href: "/", label: "Dashboard" },
    { href: "/lara", label: "✨ Lara" },
    { href: "/funil", label: "Funil" },
    { href: "/pipeline", label: "Pipeline" },
  ],
  [
    { href: "/prospeccao", label: "Empresas" },
    { href: "/medicos", label: "Médicos" },
    { href: "/escolas", label: "Escolas" },
    { href: "/igrejas", label: "Igrejas" },
    { href: "/sindicatos", label: "Sindicatos" },
    { href: "/territorio", label: "Territórios" },
  ],
  [
    { href: "/operadoras", label: "Operadoras" },
    { href: "/reajustes", label: "Reajustes" },
    { href: "/licitacoes", label: "Licitações" },
  ],
  [
    { href: "/agenda", label: "Agenda Aberta" },
    { href: "/tarefas", label: "Tarefas" },
    { href: "/encaminhamentos", label: "Encaminhamentos" },
  ],
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
      <BrandSwitcher />
    </nav>
  );
}
