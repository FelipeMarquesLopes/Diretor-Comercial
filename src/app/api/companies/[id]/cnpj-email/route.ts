import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { lookupCnpj } from "@/lib/cnpj";
import type { Company, Contact } from "@/lib/types";

// POST /api/companies/[id]/cnpj-email   body: { cnpj }
// Reforço grátis: puxa o e-mail registrado no CNPJ (Receita, via BrasilAPI) e
// salva como contato da empresa. Usado quando o Apollo não tem e-mail do
// decisor. Não gasta crédito do Apollo. Nada é enviado — só cria o contato.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { cnpj?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.cnpj || !body.cnpj.trim()) {
    return NextResponse.json({ error: "Informe o CNPJ." }, { status: 400 });
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
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  let info;
  try {
    info = await lookupCnpj(body.cnpj);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao consultar a Receita" },
      { status: 502 },
    );
  }

  if (!info.email) {
    // Achou o CNPJ mas não há e-mail registrado — devolve os dados para o CEO
    // ver que era a empresa certa, sem criar contato.
    return NextResponse.json({
      email: null,
      razaoSocial: info.razaoSocial,
      municipio: info.municipio,
      uf: info.uf,
      aviso: "Este CNPJ não tem e-mail registrado na Receita.",
    });
  }

  // Evita duplicar: se já existe um contato com esse e-mail nesta empresa, reusa.
  const { data: existing } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", company.id)
    .eq("email", info.email)
    .maybeSingle<Contact>();

  if (!existing) {
    await supabase.from("contacts").insert({
      company_id: company.id,
      name: info.razaoSocial
        ? `Contato Receita — ${info.razaoSocial}`
        : "Contato Receita (CNPJ)",
      title: "E-mail registrado no CNPJ",
      email: info.email,
      phone: info.telefone,
      email_status: "verified", // já é um e-mail real, sem depender do Apollo
    });
  }

  return NextResponse.json({
    email: info.email,
    razaoSocial: info.razaoSocial,
    nomeFantasia: info.nomeFantasia,
    municipio: info.municipio,
    uf: info.uf,
  });
}
