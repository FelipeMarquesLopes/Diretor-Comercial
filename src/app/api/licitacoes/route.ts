import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

// GET /api/licitacoes?prefeitura=guarulhos&status=nova
// Lista as licitações acompanhadas, mais recentes primeiro. Descartadas ficam
// por último (não somem — histórico).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prefeitura = searchParams.get("prefeitura");
  const status = searchParams.get("status");

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  let query = supabase
    .from("licitacoes")
    .select("*")
    .order("data_encerramento", { ascending: true, nullsFirst: false })
    .order("data_publicacao", { ascending: false })
    .limit(500);

  if (prefeitura) query = query.eq("prefeitura", prefeitura);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ licitacoes: data ?? [] });
}

// POST /api/licitacoes — cadastro MANUAL (você achou um edital num portal da
// prefeitura que o PNCP não trouxe). Entra na mesma lista de acompanhamento.
export async function POST(req: Request) {
  let body: {
    prefeitura?: string;
    orgao?: string;
    unidade?: string;
    objeto?: string;
    modalidade?: string;
    editalNumero?: string;
    dataEncerramento?: string;
    link?: string;
    contatoNome?: string;
    contatoEmail?: string;
    contatoTelefone?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.prefeitura?.trim() || !body.objeto?.trim()) {
    return NextResponse.json(
      { error: "Prefeitura e objeto são obrigatórios." },
      { status: 400 },
    );
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

  const { data, error } = await supabase
    .from("licitacoes")
    .insert({
      prefeitura: body.prefeitura.trim(),
      orgao: body.orgao?.trim() || null,
      unidade: body.unidade?.trim() || null,
      objeto: body.objeto.trim(),
      modalidade: body.modalidade?.trim() || null,
      edital_numero: body.editalNumero?.trim() || null,
      data_encerramento: body.dataEncerramento || null,
      link: body.link?.trim() || null,
      contato_nome: body.contatoNome?.trim() || null,
      contato_email: body.contatoEmail?.trim() || null,
      contato_telefone: body.contatoTelefone?.trim() || null,
      notes: body.notes?.trim() || null,
      fonte: "manual",
      status: "nova",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ licitacao: data });
}
