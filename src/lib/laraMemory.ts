// Memória da Lara — duas camadas:
//
// 1) CONVERSA persistida (lara_mensagens): o histórico do chat, para a Lara
//    continuar de onde parou em qualquer aparelho.
// 2) FATOS de longo prazo (lara_memoria): coisas que ela deve lembrar sempre,
//    injetadas no início de toda conversa.
//
// Tudo aqui é defensivo: se o Supabase não estiver configurado ou a tabela não
// existir ainda, as funções não quebram a Lara — ela apenas roda "sem memória".

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "./supabase/server";
import type { LaraTurn, LaraAnexo } from "./lara";

function db(): SupabaseClient | null {
  try {
    return getServerSupabase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- CONVERSA ---

interface LinhaMensagem {
  role: "user" | "assistant";
  content: string;
  acoes: string[] | null;
  anexos: { nome: string; mediaType: string }[] | null;
}

// Carrega as últimas mensagens da conversa (ordem cronológica). Usado tanto
// para RENDERIZAR o chat quanto para alimentar o modelo.
export async function carregarHistorico(limite = 40): Promise<LinhaMensagem[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("lara_mensagens")
    .select("role, content, acoes, anexos")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  return (data as LinhaMensagem[]).reverse();
}

// Salva uma mensagem. Para anexos, guarda só nome/tipo (nunca o base64).
export async function salvarMensagem(msg: {
  role: "user" | "assistant";
  content: string;
  acoes?: string[];
  anexos?: LaraAnexo[];
}): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  const anexos =
    msg.anexos && msg.anexos.length > 0
      ? msg.anexos.map((a) => ({ nome: a.nome, mediaType: a.mediaType }))
      : null;
  await supabase
    .from("lara_mensagens")
    .insert({
      role: msg.role,
      content: msg.content || "",
      acoes: msg.acoes && msg.acoes.length ? msg.acoes : null,
      anexos,
    })
    .then(
      () => {},
      () => {},
    );
}

// Apaga toda a conversa (botão "nova conversa"). Não mexe nos fatos de memória.
export async function limparHistorico(): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase
    .from("lara_mensagens")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000")
    .then(
      () => {},
      () => {},
    );
}

// Converte o histórico salvo em turnos para o modelo (sem base64 — os anexos
// antigos entram só como referência textual; turnParaMensagem lida com isso).
export function historicoParaTurnos(linhas: LinhaMensagem[]): LaraTurn[] {
  return linhas.map((l) => ({
    role: l.role,
    content: l.content,
    anexos: l.anexos
      ? l.anexos.map((a) => ({ nome: a.nome, mediaType: a.mediaType, base64: "" }))
      : undefined,
  }));
}

// ------------------------------------------------------------------ FATOS ---

export interface FatoMemoria {
  id: string;
  chave: string | null;
  conteudo: string;
}

// Lê os fatos de longo prazo (curados) para injetar no system prompt.
export async function carregarMemoria(limite = 60): Promise<FatoMemoria[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("lara_memoria")
    .select("id, chave, conteudo")
    .order("updated_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  return data as FatoMemoria[];
}

// Grava/atualiza um fato. Se vier `chave`, faz upsert por chave (atualiza o
// fato existente); senão, cria um novo.
export async function lembrarFato(input: {
  conteudo: string;
  chave?: string;
}): Promise<{ ok: true } | { erro: string }> {
  const supabase = db();
  if (!supabase) return { erro: "Memória indisponível (Supabase não configurado)." };
  const conteudo = (input.conteudo ?? "").trim();
  if (!conteudo) return { erro: "Faltou o conteúdo do que lembrar." };
  const chave = input.chave?.trim() || null;

  if (chave) {
    const { error } = await supabase
      .from("lara_memoria")
      .upsert({ chave, conteudo }, { onConflict: "chave" });
    if (error) return { erro: error.message };
    return { ok: true };
  }
  const { error } = await supabase.from("lara_memoria").insert({ conteudo });
  if (error) return { erro: error.message };
  return { ok: true };
}

// Remove um fato por chave ou por id.
export async function esquecerFato(input: {
  chave?: string;
  id?: string;
}): Promise<{ ok: true } | { erro: string }> {
  const supabase = db();
  if (!supabase) return { erro: "Memória indisponível." };
  let q = supabase.from("lara_memoria").delete();
  if (input.id) q = q.eq("id", input.id);
  else if (input.chave?.trim()) q = q.eq("chave", input.chave.trim());
  else return { erro: "Diga a chave ou o id do que esquecer." };
  const { error } = await q;
  if (error) return { erro: error.message };
  return { ok: true };
}
