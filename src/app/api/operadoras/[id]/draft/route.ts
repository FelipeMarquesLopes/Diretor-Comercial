import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Sequence } from "@/lib/types";

// Gerar o rascunho da operadora chama a IA — pode passar do tempo padrão.
export const maxDuration = 60;

// POST /api/operadoras/[id]/draft
// Gera (ou regenera) UM rascunho de e-mail já endereçado para a operadora,
// para o clique final do CEO. Separado do fluxo do Apollo de propósito: assim
// a revelação dos e-mails e a geração do rascunho não competem pelo mesmo
// tempo de execução (o que fazia o rascunho não gerar em operadoras grandes).
export async function POST(
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

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single<Company>();

  if (!company) {
    return NextResponse.json(
      { error: "Operadora não encontrada" },
      { status: 404 },
    );
  }

  // Precisa de um contato com e-mail (o destinatário).
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id);
  const temEmail = (contacts ?? []).some((c) => c.email);
  if (!temEmail) {
    return NextResponse.json(
      {
        error:
          "Esta operadora ainda não tem um contato com e-mail. Defina o destinatário (Apollo ou edição) antes de gerar o rascunho.",
      },
      { status: 400 },
    );
  }

  await ensureSequences(supabase, id, false);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", id)
    .eq("channel", "email");
  const emailSeq = (seqs as Sequence[] | null)?.[0];
  if (!emailSeq) {
    return NextResponse.json(
      { error: "Sequência de e-mail não encontrada." },
      { status: 500 },
    );
  }

  // Remove rascunhos de e-mail ainda pendentes (não enviados) para não duplicar.
  await supabase
    .from("drafts")
    .delete()
    .eq("company_id", id)
    .eq("channel", "email")
    .eq("status", "pendente");

  const res = await generateDraftForSequence(supabase, company, emailSeq, "nr1");
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Erro ao gerar rascunho" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
