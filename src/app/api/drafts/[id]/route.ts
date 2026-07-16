import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { DraftStatus } from "@/lib/types";

// PATCH /api/drafts/[id]
// Aprova, rejeita, marca como enviado, ou edita o corpo de um rascunho.
// Body: { action: "aprovar" | "rejeitar" | "enviar" | "editar",
//         subject?, body?, approvedBy? }
//
// É AQUI que mora a regra inegociável: nada sai até um humano aprovar.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payload: {
    action?: "aprovar" | "rejeitar" | "enviar" | "editar";
    subject?: string;
    body?: string;
    approvedBy?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }
  const update: Record<string, unknown> = {};
  let activity = "";
  let newCompanyStatus: string | null = null;

  switch (payload.action) {
    case "aprovar":
      update.status = "aprovado" as DraftStatus;
      update.approved_by = payload.approvedBy ?? "CEO";
      update.approved_at = new Date().toISOString();
      activity = "Rascunho APROVADO pelo CEO — pronto para disparar.";
      break;
    case "rejeitar":
      update.status = "rejeitado" as DraftStatus;
      activity = "Rascunho rejeitado pelo CEO.";
      break;
    case "enviar":
      update.status = "enviado" as DraftStatus;
      update.sent_at = new Date().toISOString();
      activity = "Mensagem marcada como enviada.";
      newCompanyStatus = "contato_iniciado";
      break;
    case "editar":
      if (payload.subject !== undefined) update.subject = payload.subject;
      if (payload.body !== undefined) update.body = payload.body;
      activity = "Rascunho editado manualmente.";
      break;
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const { data: draft, error } = await supabase
    .from("drafts")
    .update(update)
    .eq("id", id)
    .select("*, company_id")
    .single();

  if (error || !draft) {
    return NextResponse.json(
      { error: error?.message ?? "Rascunho não encontrado" },
      { status: 404 },
    );
  }

  await supabase.from("activities").insert({
    company_id: draft.company_id,
    type: "aprovacao",
    description: activity,
  });

  if (newCompanyStatus) {
    await supabase
      .from("companies")
      .update({ status: newCompanyStatus })
      .eq("id", draft.company_id);
  }

  return NextResponse.json({ draft });
}
