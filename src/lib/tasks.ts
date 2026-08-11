// Fase 3.2 — Helper de tarefas para o comercial.
//
// Tarefas HUMANAS (relacionamento presencial, enviar documentos, registrar um
// contato indicado…). A IA cria tarefas de APOIO (Nível 1); o CEO cria as
// suas. Nunca há dado de paciente — é gestão comercial.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface NewTask {
  companyId?: string | null;
  title: string;
  detail?: string | null;
  level?: number;
  dueDate?: string | null;
  createdBy?: string; // 'ia' | e-mail do CEO
}

/**
 * Cria uma tarefa. `dedupeOpen` evita duplicar tarefas automáticas: se já
 * existir uma tarefa ABERTA com o mesmo título para a mesma empresa, não cria
 * outra (retorna a existente).
 */
export async function createTask(
  supabase: SupabaseClient,
  t: NewTask,
  opts?: { dedupeOpen?: boolean },
): Promise<{ ok: boolean; id?: string; skipped?: boolean; error?: string }> {
  if (!t.title?.trim()) return { ok: false, error: "Título é obrigatório" };

  if (opts?.dedupeOpen && t.companyId) {
    const { data: existing } = await supabase
      .from("tasks")
      .select("id")
      .eq("company_id", t.companyId)
      .eq("title", t.title.trim())
      .eq("status", "aberta")
      .limit(1);
    if (existing && existing.length) {
      return { ok: true, id: existing[0].id, skipped: true };
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      company_id: t.companyId ?? null,
      title: t.title.trim(),
      detail: t.detail ?? null,
      level: t.level ?? 1,
      due_date: t.dueDate ?? null,
      created_by: t.createdBy ?? "ia",
      status: "aberta",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}
