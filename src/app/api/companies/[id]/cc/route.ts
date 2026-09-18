import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSuppressedSet } from "@/lib/suppression";
import type { Company } from "@/lib/types";

export const maxDuration = 30;

// POST /api/companies/[id]/cc  { add?: string[], remove?: string[], set?: string[] }
// Gerencia os e-mails em CÓPIA (CC) do parceiro — usados quando o rascunho é
// enviado. Dá à Lara controle real do campo de cópia (não só citar no texto).
// Bloqueia e-mails suprimidos (retorno/descadastro). O envio segue com o clique
// do CEO.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { add?: string[]; remove?: string[]; set?: string[] };
  try {
    body = await req.json();
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

  const { data: company } = await supabase
    .from("companies")
    .select("id, cc_emails")
    .eq("id", id)
    .single<Pick<Company, "id" | "cc_emails">>();
  if (!company) {
    return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  }

  const parse = (s: string | null | undefined): string[] =>
    (s ?? "")
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
  const limpar = (arr?: string[]): string[] =>
    (arr ?? [])
      .flatMap((e) => parse(e))
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

  const atuais = parse(company.cc_emails);
  const add = limpar(body.add);
  const remove = new Set(limpar(body.remove).map((e) => e.toLowerCase()));
  const set = body.set !== undefined ? limpar(body.set) : null;

  // Base: 'set' substitui tudo; senão parte dos atuais + adiciona - remove.
  let base = set !== null ? set : [...atuais, ...add];
  base = base.filter((e) => !remove.has(e.toLowerCase()));

  // Bloqueia e-mails suprimidos (retorno/descadastro) e remove duplicatas.
  const suprimidos = await getSuppressedSet(supabase, base);
  const finais: string[] = [];
  const vistos = new Set<string>();
  const bloqueados: string[] = [];
  for (const e of base) {
    const key = e.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    if (suprimidos.has(key)) {
      bloqueados.push(e);
      continue;
    }
    finais.push(e);
  }

  const { error } = await supabase
    .from("companies")
    .update({ cc_emails: finais.join(", ") || null })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activities").insert({
    company_id: id,
    type: "cadastro",
    description: `Lara atualizou a lista de cópia (CC): ${finais.length} e-mail(s).`,
  });

  return NextResponse.json({
    ok: true,
    cc: finais,
    total: finais.length,
    bloqueados, // e-mails que ficaram de fora por estarem na lista de bloqueio
  });
}
