// Modelo de IA usado por todo o sistema (rascunhos, réplicas, classificação,
// Lara). Centralizado aqui para ter uma fonte única.
//
// Regra: usamos o Claude Opus 5 (mais capaz atual). Respeitamos a variável
// ANTHROPIC_MODEL SE ela apontar para um modelo DIFERENTE (caso o CEO queira
// trocar de propósito), mas IGNORAMOS o valor antigo "claude-opus-4-8" — assim
// o upgrade vale mesmo que a variável tenha ficado desatualizada na Vercel,
// sem precisar mexer no painel.

const PADRAO = "claude-opus-5";
const OBSOLETOS = new Set(["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6"]);

export const MODEL: string = (() => {
  const env = process.env.ANTHROPIC_MODEL?.trim();
  if (env && !OBSOLETOS.has(env)) return env;
  return PADRAO;
})();
