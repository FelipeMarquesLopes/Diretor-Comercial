"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

// Login por link mágico (OTP por e-mail): sem senha para vazar, sem senha
// para o time esquecer. O Supabase envia o e-mail; o link volta para
// /auth/callback, que troca o código pela sessão.

export function LoginForm({ proximo }: { proximo: string }) {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"parado" | "enviando" | "enviado">(
    "parado",
  );
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEstado("enviando");

    try {
      const supabase = getBrowserSupabase();
      const destino = `${window.location.origin}/auth/callback?proximo=${encodeURIComponent(proximo)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: destino },
      });

      if (error) throw error;
      setEstado("enviado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o link.");
      setEstado("parado");
    }
  }

  if (estado === "enviado") {
    return (
      <div className="rounded-xl border border-accent-green/40 bg-accent-green/10 px-4 py-5 text-center">
        <p className="text-sm font-semibold text-brand-900">
          Link enviado para {email}
        </p>
        <p className="mt-1 text-xs text-brand-500">
          Abra o e-mail e clique em entrar. Pode fechar esta aba.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-brand-500">
          E-mail
        </span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          className="field"
          placeholder="voce@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      {erro ? <p className="text-xs text-accent-coral">{erro}</p> : null}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={estado === "enviando"}
      >
        {estado === "enviando" ? "Enviando…" : "Receber link de acesso"}
      </button>
    </form>
  );
}
