"use client";

import { useState } from "react";

/** Copia o link do convite para a área de transferência. */
export function CopyLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência (ou HTTP sem TLS):
      // mostra o link para copiar na mão.
      window.prompt("Copie o link do convite:", url);
    }
  }

  return (
    <button type="button" onClick={copiar} className="btn-ghost py-1.5 text-xs">
      {copiado ? "Copiado" : "Copiar link"}
    </button>
  );
}
