import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { advanceSequenceAfterSend } from "@/lib/outreach";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import type { DraftStatus } from "@/lib/types";

// PATCH /api/drafts/[id]
// Aprova, rejeita, envia, ou edita o corpo de um rascunho.
// Body: { action: "aprovar" | "rejeitar" | "enviar" | "enviar_email" | "editar",
//         subject?, body?, approvedBy? }
//
// É AQUI que mora a regra inegociável: nada sai até um humano clicar.
// "enviar_email" dispara de verdade pelo Gmail; "enviar" apenas marca como
// enviado (para o WhatsApp, enquanto a API oficial não está ligada).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payload: {
    action?: "aprovar" | "rejeitar" | "enviar" | "enviar_email" | "editar";
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
    case "enviar_email": {
      if (!isEmailConfigured()) {
        return NextResponse.json(
          { error: "Gmail ainda não conectado. Configure GMAIL_USER e GMAIL_APP_PASSWORD." },
          { status: 400 },
        );
      }
      // Busca o destinatário e o conteúdo antes de enviar.
      const { data: pre } = await supabase
        .from("drafts")
        .select("subject, body, contacts(email)")
        .eq("id", id)
        .single();
      const to = (pre?.contacts as { email?: string } | null)?.email;
      if (!to) {
        return NextResponse.json(
          { error: "Este contato não tem e-mail cadastrado." },
          { status: 400 },
        );
      }
      try {
        await sendEmail({
          to,
          subject: (pre?.subject as string) ?? "",
          text: (pre?.body as string) ?? "",
        });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Falha ao enviar e-mail" },
          { status: 502 },
        );
      }
      update.status = "enviado" as DraftStatus;
      update.approved_by = payload.approvedBy ?? "CEO";
      update.approved_at = new Date().toISOString();
      update.sent_at = new Date().toISOString();
      activity = `E-mail aprovado e enviado para ${to}.`;
      newCompanyStatus = "contato_iniciado";
      break;
    }
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

  // Ao enviar (real ou marcado), o motor avança e agenda a próxima cutucada.
  if (
    (payload.action === "enviar" || payload.action === "enviar_email") &&
    draft.sequence_id
  ) {
    await advanceSequenceAfterSend(supabase, draft.sequence_id);
  }

  return NextResponse.json({ draft });
}

// DELETE /api/drafts/[id] — exclui de vez um rascunho que o CEO não quer enviar
// (funciona para e-mail e WhatsApp).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }
  const { error } = await supabase.from("drafts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
