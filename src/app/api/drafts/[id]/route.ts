import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { advanceSequenceAfterSend } from "@/lib/outreach";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSuppressedSet } from "@/lib/suppression";
import type { DraftStatus } from "@/lib/types";

// Enviar pode incluir retentativas de SMTP (conexão instável) — dá folga.
export const maxDuration = 60;

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
      // Busca o destinatário, o conteúdo, os CCs, os anexos e a sequência.
      const { data: pre } = await supabase
        .from("drafts")
        .select(
          "subject, body, attachments, sequence_id, contacts(email), companies(cc_emails)",
        )
        .eq("id", id)
        .single();
      const to = (pre?.contacts as { email?: string } | null)?.email;
      if (!to) {
        return NextResponse.json(
          { error: "Este contato não tem e-mail cadastrado." },
          { status: 400 },
        );
      }
      // CCs opcionais (informados no cadastro): separados por vírgula/;/espaço.
      const ccRaw =
        (pre?.companies as { cc_emails?: string } | null)?.cc_emails ?? "";
      let extraCc = ccRaw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"));

      // SUPRESSÃO: nunca disparar para quem já retornou (bounce) ou foi
      // bloqueado. Protege a reputação e a conta de envio (Titan).
      const suprimidos = await getSuppressedSet(supabase, [to, ...extraCc]);
      if (suprimidos.has(to.toLowerCase())) {
        return NextResponse.json(
          {
            error:
              "Este destinatário está na lista de bloqueio (retornou antes / bounce). Troque o e-mail do destinatário antes de enviar.",
          },
          { status: 409 },
        );
      }
      // Remove do CC qualquer endereço suprimido (segue o envio sem eles).
      extraCc = extraCc.filter((e) => !suprimidos.has(e.toLowerCase()));

      // TRAVA DE VOLUME DIÁRIO: protege a conta de envio de um disparo em massa
      // acidental. Conta os e-mails enviados nas últimas 24h; acima do limite,
      // bloqueia (o rascunho fica pendente para o dia seguinte).
      const capDiario = Number(process.env.EMAIL_DAILY_CAP ?? "50");
      const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: enviados24h } = await supabase
        .from("drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "enviado")
        .eq("channel", "email")
        .gte("sent_at", desde24h);
      if ((enviados24h ?? 0) >= capDiario) {
        return NextResponse.json(
          {
            error: `Limite diário de envio atingido (${capDiario} e-mails/24h). Isto protege a reputação do domínio. O rascunho continua aqui — envie amanhã, ou ajuste EMAIL_DAILY_CAP.`,
          },
          { status: 429 },
        );
      }

      // Baixa os anexos do Storage para irem junto no e-mail.
      const anexos =
        (pre?.attachments as { path: string; name: string }[] | null) ?? [];
      const attachments: { filename: string; content: Buffer }[] = [];
      for (const a of anexos) {
        const { data } = await supabase.storage.from("anexos").download(a.path);
        if (data) {
          attachments.push({
            filename: a.name,
            content: Buffer.from(await data.arrayBuffer()),
          });
        }
      }
      // Threading: mantém a conversa amarrada (mesmo assunto "Re:" +
      // In-Reply-To), para o destinatário ver o histórico/contexto.
      const seqId = (pre as { sequence_id?: string } | null)?.sequence_id ?? null;
      let seqThread: { last_message_id: string | null; thread_subject: string | null } | null =
        null;
      if (seqId) {
        const { data } = await supabase
          .from("sequences")
          .select("last_message_id, thread_subject")
          .eq("id", seqId)
          .single<{ last_message_id: string | null; thread_subject: string | null }>();
        seqThread = data ?? null;
      }
      const draftSubject = (pre?.subject as string) ?? "";
      const semRe = draftSubject.replace(/^\s*(re:\s*)+/i, "").trim();
      // 1º e-mail do assunto: usa o assunto como está. Follow-ups/réplicas:
      // usam "Re: <assunto raiz>" para casar a conversa.
      const sendSubject = seqThread?.thread_subject
        ? `Re: ${seqThread.thread_subject}`
        : draftSubject;
      const inReplyTo = seqThread?.last_message_id ?? undefined;

      let sentInfo: { messageId?: string } = {};
      try {
        sentInfo = await sendEmail({
          to,
          subject: sendSubject,
          text: (pre?.body as string) ?? "",
          extraCc,
          attachments,
          inReplyTo,
          references: inReplyTo,
        });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Falha ao enviar e-mail" },
          { status: 502 },
        );
      }

      // Atualiza o estado da thread: guarda o Message-ID enviado e fixa o
      // assunto raiz (se ainda não houver).
      if (seqId) {
        await supabase
          .from("sequences")
          .update({
            last_message_id: sentInfo.messageId ?? seqThread?.last_message_id ?? null,
            thread_subject: seqThread?.thread_subject ?? (semRe || draftSubject),
          })
          .eq("id", seqId);
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
