"use client";

// Layout premium: MENU LATERAL à esquerda (azul metálico com ondas) + conteúdo
// maior à direita. A sidebar reúne o seletor de marca (logos), o wordmark e a
// navegação agrupada. No celular, vira uma barra no topo com menu deslizante.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRANDS, type BrandId } from "@/lib/brands";

const LOGOS: Record<BrandId, { src: string; alt: string }> = {
  menthalhelp: { src: "/logo.png", alt: "Clínica Multidisciplinar MenthalHelp" },
  therapy_minds: { src: "/therapy-minds.png", alt: "Therapy Minds" },
};
const ORDEM: BrandId[] = ["menthalhelp", "therapy_minds"];

const GRUPOS: { titulo: string; itens: { href: string; label: string }[] }[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", label: "Dashboard" },
      { href: "/lara", label: "✨ Lara" },
      { href: "/funil", label: "Funil" },
      { href: "/pipeline", label: "Pipeline" },
    ],
  },
  {
    titulo: "Captação",
    itens: [
      { href: "/prospeccao", label: "Empresas" },
      { href: "/medicos", label: "Médicos" },
      { href: "/escolas", label: "Escolas" },
      { href: "/igrejas", label: "Igrejas" },
      { href: "/territorio", label: "Territórios" },
    ],
  },
  {
    titulo: "Convênios",
    itens: [
      { href: "/operadoras", label: "Operadoras" },
      { href: "/sindicatos", label: "Sindicatos" },
      { href: "/contratos", label: "Reajustes" },
      { href: "/licitacoes", label: "Licitações" },
    ],
  },
  {
    titulo: "Recorrente",
    itens: [
      { href: "/agenda", label: "Agenda Aberta" },
      { href: "/tarefas", label: "Tarefas" },
      { href: "/encaminhamentos", label: "Encaminhamentos" },
    ],
  },
  {
    titulo: "Enviar",
    itens: [{ href: "/rascunhos", label: "Rascunhos" }],
  },
];

function lerMarca(): BrandId | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)marca=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v === "therapy_minds" || v === "menthalhelp" ? v : null;
}
function gravarMarca(b: BrandId) {
  document.cookie = `marca=${b}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

// Ondas decorativas no rodapé da sidebar (sutis, metálicas).
function Ondas() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full"
      viewBox="0 0 400 160"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 96 C 70 66, 130 126, 210 96 S 340 66, 400 100 L400 160 L0 160 Z"
        fill="rgba(143,208,255,0.10)"
      />
      <path
        d="M0 116 C 80 92, 140 146, 220 114 S 350 92, 400 120 L400 160 L0 160 Z"
        fill="rgba(143,208,255,0.14)"
      />
      <path
        d="M0 136 C 90 118, 150 160, 230 134 S 360 116, 400 140 L400 160 L0 160 Z"
        fill="rgba(207,232,255,0.18)"
      />
    </svg>
  );
}

function SidebarContent({
  marca,
  onTrocarMarca,
  onNavigate,
}: {
  marca: BrandId | null;
  onTrocarMarca: (b: BrandId) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="relative flex h-full flex-col">
      <Ondas />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Topo: marca + wordmark */}
        <div className="px-4 pb-4 pt-5">
          <div className="flex items-center justify-center gap-2.5">
            {ORDEM.map((b) => {
              const ativo = marca === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => onTrocarMarca(b)}
                  title={
                    ativo
                      ? `Trabalhando na ${BRANDS[b].label}`
                      : `Trocar para a ${BRANDS[b].label}`
                  }
                  aria-pressed={ativo}
                  className={`rounded-xl bg-white p-1.5 shadow-sm transition-all ${
                    ativo
                      ? "ring-2 ring-offset-2 ring-offset-[#0d2a52]"
                      : "opacity-55 grayscale hover:opacity-90 hover:grayscale-0"
                  }`}
                  style={
                    ativo
                      ? { ["--tw-ring-color" as string]: BRANDS[b].accent }
                      : undefined
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={LOGOS[b].src} alt={LOGOS[b].alt} className="h-9 w-auto" />
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-center">
            <p className="text-base font-bold tracking-tight text-white">Growth AI</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
              Diretor Comercial Digital
            </p>
            {marca && (
              <p className="mt-1 text-[10px] font-medium text-white/60">
                {BRANDS[marca].label}
              </p>
            )}
          </div>
        </div>

        <div className="mx-4 mb-2 h-px bg-white/10" />

        {/* Navegação agrupada */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="mb-4">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {g.titulo}
              </p>
              <div className="space-y-0.5">
                {g.itens.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={onNavigate}
                      className={`sidebar-link ${
                        active ? "sidebar-link-active" : ""
                      } block rounded-lg px-3 py-2 text-sm font-medium ${
                        active ? "text-white" : "text-white/75 hover:text-white"
                      }`}
                    >
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [marca, setMarca] = useState<BrandId | null>(null);
  const [pronto, setPronto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    setMarca(lerMarca());
    setPronto(true);
  }, []);

  function trocar(b: BrandId) {
    if (b === marca) return;
    gravarMarca(b);
    setMarca(b);
    window.location.reload();
  }
  function escolherNoGate(b: BrandId) {
    gravarMarca(b);
    setMarca(b);
    window.location.reload();
  }

  const precisaEscolher = pronto && !marca;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar fixa (desktop) */}
      <aside className="sidebar-premium sticky top-0 hidden h-screen w-64 shrink-0 overflow-hidden lg:block">
        <SidebarContent marca={marca} onTrocarMarca={trocar} />
      </aside>

      {/* Drawer (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuAberto(false)}
          />
          <aside className="sidebar-premium absolute inset-y-0 left-0 w-72 overflow-hidden shadow-2xl">
            <SidebarContent
              marca={marca}
              onTrocarMarca={trocar}
              onNavigate={() => setMenuAberto(false)}
            />
          </aside>
        </div>
      )}

      {/* Área de conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (mobile) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-brand-100 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="rounded-lg border border-brand-200 p-2 text-brand-700 hover:bg-brand-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="brand-wordmark text-base font-bold">Growth AI</span>
          {marca && (
            <span className="ml-auto text-xs font-medium text-brand-800/60">
              {BRANDS[marca].label}
            </span>
          )}
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>

      {/* Tela de escolha da marca — primeiro acesso */}
      {precisaEscolher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-brand-100 bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-center text-lg font-semibold text-brand-800">
              Com qual marca você vai trabalhar agora?
            </h2>
            <p className="mt-1 text-center text-xs text-brand-800/60">
              Cada marca tem sua própria base, seus rascunhos e seu remetente.
              Você troca a qualquer momento clicando na logo.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ORDEM.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => escolherNoGate(b)}
                  className="group flex flex-col items-center gap-3 rounded-xl border-2 border-brand-100 p-5 transition-all hover:border-brand-300 hover:shadow-card"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={LOGOS[b].src}
                    alt={LOGOS[b].alt}
                    className="h-16 w-auto transition-transform group-hover:scale-105"
                  />
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: BRANDS[b].accent }}
                  >
                    Entrar na {BRANDS[b].label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
