"use client";

// Cabeçalho com as DUAS marcas + seleção da marca ativa.
//
// - As logos são o próprio seletor: clicar numa logo troca a marca ativa (a
//   ativa fica destacada, a outra apagada). Elegante e sempre à mão.
// - No PRIMEIRO acesso (sem marca escolhida ainda), aparece uma tela para o
//   Felipe escolher com qual marca vai trabalhar.
//
// A marca fica num cookie `marca` (o servidor lê em toda chamada e devolve só
// os dados daquela marca). Ao trocar, recarregamos para tudo recarregar na
// marca certa.

import { useEffect, useState } from "react";
import { BRANDS, type BrandId } from "@/lib/brands";

const LOGOS: Record<BrandId, { src: string; alt: string }> = {
  menthalhelp: { src: "/logo.png", alt: "Clínica Multidisciplinar MenthalHelp" },
  therapy_minds: { src: "/therapy-minds.png", alt: "Therapy Minds" },
};

const ORDEM: BrandId[] = ["menthalhelp", "therapy_minds"];

function lerMarca(): BrandId | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)marca=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v === "therapy_minds" || v === "menthalhelp" ? v : null;
}

function gravarMarca(b: BrandId) {
  document.cookie = `marca=${b}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

export function BrandHeader() {
  const [marca, setMarca] = useState<BrandId | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setMarca(lerMarca());
    setPronto(true);
  }, []);

  function trocar(b: BrandId) {
    if (b === marca) return;
    gravarMarca(b);
    setMarca(b);
    window.location.reload(); // recarrega tudo já na marca escolhida
  }

  function escolherNoGate(b: BrandId) {
    gravarMarca(b);
    setMarca(b);
    window.location.reload();
  }

  const precisaEscolher = pronto && !marca;

  return (
    <>
      <header className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
        <div className="brand-rainbow h-1.5 w-full" />
        <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
          {/* Logos = seletor de marca. A ativa destacada, a outra apagada. */}
          <div className="flex items-center justify-center gap-5 sm:gap-8">
            {ORDEM.map((b, i) => {
              const ativo = marca === b;
              return (
                <div key={b} className="flex items-center gap-5 sm:gap-8">
                  {i > 0 && (
                    <span aria-hidden className="h-14 w-px bg-brand-100 sm:h-16" />
                  )}
                  <button
                    type="button"
                    onClick={() => trocar(b)}
                    title={
                      ativo
                        ? `Você está trabalhando na ${BRANDS[b].label}`
                        : `Trocar para a ${BRANDS[b].label}`
                    }
                    aria-pressed={ativo}
                    className={`rounded-xl p-1.5 transition-all ${
                      ativo
                        ? "ring-2 ring-offset-2"
                        : "opacity-40 grayscale hover:opacity-80 hover:grayscale-0"
                    }`}
                    style={ativo ? { ["--tw-ring-color" as string]: BRANDS[b].accent } : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={LOGOS[b].src}
                      alt={LOGOS[b].alt}
                      className="h-20 w-auto sm:h-24"
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div>
            <p className="brand-wordmark text-lg font-bold tracking-tight sm:text-xl">
              Growth AI
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-400">
              Diretor Comercial Digital
            </p>
            {marca && (
              <p className="mt-1 text-[11px] font-medium text-brand-800/60">
                Trabalhando em{" "}
                <span style={{ color: BRANDS[marca].accent }}>
                  {BRANDS[marca].label}
                </span>{" "}
                · clique na outra logo para trocar
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Tela de escolha da marca — primeiro acesso (sem marca definida). */}
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
                  style={{ ["--tw-ring-color" as string]: BRANDS[b].accent }}
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
    </>
  );
}
