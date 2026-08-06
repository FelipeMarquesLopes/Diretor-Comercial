import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, MessageHook, Sequence } from "@/lib/types";

// Gerar o rascunho chama a IA — pode passar do tempo padrão.
export const maxDuration = 60;

// POST /api/companies/[id]/draft
// Gera (ou regenera) UM rascunho de e-mail já endereçado, para QUALQUER
// cadastro (operadora, empresa, médico, escola). Serve de "tentar de novo"
// quando a IA falha na geração — sem refazer Apollo/verificação.
// Body: { hook? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { hook?: MessageHook } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
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

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single<Company>();

  if (!company) {
    return NextResponse.json({ error: "Cadastro não encontrado" }, { status: 404 });
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
          "Este cadastro ainda não tem um contato com e-mail. Defina o destinatário (Apollo, revelar ou edição) antes de gerar o rascunho.",
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

  const res = await generateDraftForSequence(
    supabase,
    company,
    emailSeq,
    body.hook ?? "nr1",
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Erro ao gerar rascunho" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
