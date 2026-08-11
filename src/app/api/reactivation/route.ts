import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Sequence } from "@/lib/types";

// Gerar o rascunho de reativação chama a IA — dá folga.
export const maxDuration = 60;

const DIA = 24 * 60 * 60 * 1000;

// GET /api/reactivation
// Lista oportunidades ABANDONADAS: parceiros que demonstraram interesse
// (status "em_negociacao") mas ficaram sem NENHUMA interação há muitos dias.
export async function GET() {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  const staleDays = Number(process.env.REACTIVATION_STALE_DAYS ?? "45");
  const cutoff = new Date(Date.now() - staleDays * DIA).toISOString();

  const { data: comps } = await supabase
    .from("companies")
    .select("id, name, category")
    .eq("status", "em_negociacao")
    .limit(100);

  const rows = (comps as { id: string; name: string; category: string }[] | null) ?? [];
  const out: {
    id: string;
    name: string;
    category: string;
    lastActivity: string | null;
    dias: number | null;
  }[] = [];

  for (const c of rows) {
    const { data: act } = await supabase
      .from("activities")
      .select("created_at")
      .eq("company_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = (act as { created_at: string }[] | null)?.[0]?.created_at ?? null;
    if (!last || last < cutoff) {
      out.push({
        id: c.id,
        name: c.name,
        category: c.category,
        lastActivity: last,
        dias: last ? Math.floor((Date.now() - new Date(last).getTime()) / DIA) : null,
      });
    }
  }

  // Mais parado primeiro.
  out.sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
  return NextResponse.json({ staleDays, oportunidades: out });
}

// POST /api/reactivation  { companyId }
// Reativa a oportunidade: gera JÁ um rascunho de retomada (com a memória do
// histórico) para o clique final do CEO (Nível 2 — nada sai sozinho).
export async function POST(req: Request) {
  let body: { companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.companyId) {
    return NextResponse.json({ error: "companyId é obrigatório" }, { status: 400 });
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
    .eq("id", body.companyId)
    .single<Company>();
  if (!company) {
    return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  }

  await ensureSequences(supabase, company.id, false);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", company.id)
    .eq("channel", "email");
  const emailSeq = (seqs as Sequence[] | null)?.[0];
  if (!emailSeq) {
    return NextResponse.json(
      { error: "Sequência de e-mail não encontrada." },
      { status: 500 },
    );
  }

  // Reativa a sequência e limpa rascunhos pendentes antigos para não duplicar.
  await supabase
    .from("sequences")
    .update({ status: "ativa", next_action_at: null })
    .eq("id", emailSeq.id);
  await supabase
    .from("drafts")
    .delete()
    .eq("company_id", company.id)
    .eq("channel", "email")
    .eq("status", "pendente");

  const res = await generateDraftForSequence(supabase, company, emailSeq, "nr1");
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Erro ao gerar rascunho" },
      { status: 502 },
    );
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "decisao",
    description: "Oportunidade reativada pelo CEO — rascunho de retomada gerado.",
  });

  return NextResponse.json({ ok: true });
}
