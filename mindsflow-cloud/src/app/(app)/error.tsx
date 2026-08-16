"use client";

// Erro de tela ou de ação (ex.: o banco recusou por RLS, ou uma validação
// falhou). Em vez da tela branca do Next, mostra a mensagem e um caminho de
// volta.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-accent-coral/40 bg-white p-6 shadow-card">
      <h2 className="text-sm font-semibold text-brand-900">
        Algo não deu certo
      </h2>
      <p className="mt-2 text-sm text-brand-600">{error.message}</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Tentar de novo
        </button>
        <a href="/dashboard" className="btn-ghost">
          Voltar ao painel
        </a>
      </div>
    </div>
  );
}
