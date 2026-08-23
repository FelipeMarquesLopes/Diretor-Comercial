import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { searchCompanies, searchDecisionMakers } from "@/lib/apollo";
import { qualifyCompany } from "@/lib/qualify";

// POST /api/prospect
// Busca empresas no Apollo, qualifica, e persiste no banco (com decisores).
// Body: { locations?, keywords?, minEmployees?, perPage?, withContacts?,
//         onlyWithEmail? }
export async function POST(req: Request) {
  let body: {
    locations?: string[];
    keywords?: string[];
    notKeywords?: string[];
    name?: string;
    minEmployees?: number;
    maxEmployees?: number;
    perPage?: number;
    withContacts?: boolean;
    // Quando true (padrão), só salva empresas que TÊM um decisor encontrado
    // (nome + cargo, com quem dá para revelar o e-mail depois). As sem nenhum
    // decisor são descartadas para não poluir a lista.
    // OBS: o Apollo só CONFIRMA o e-mail ao revelar (1 crédito), então não dá
    // para saber de graça se o e-mail existe — por isso filtramos por "tem
    // decisor", e a revelação acontece no clique de "Abordar".
    onlyWithContact?: boolean;
    // Categoria em que salvar (empresa por padrão; "medico" para a frente de
    // médicos/consultórios — muda a tese da IA e não filtra por porte).
    category?: string;
    // Quando true, ignora o filtro de nº de funcionários (ex: sindicatos, que
    // raramente têm headcount no Apollo).
    skipEmployees?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // "Só com decisor" exige buscar os decisores (é de graça no Apollo).
  const onlyWithContact = body.onlyWithContact !== false;
  const withContacts = body.withContacts !== false || onlyWithContact;
  const category: "empresa" | "medico" | "escola" | "igreja" | "sindicato" =
    body.category === "medico"
      ? "medico"
      : body.category === "escola"
        ? "escola"
        : body.category === "igreja"
          ? "igreja"
          : body.category === "sindicato"
            ? "sindicato"
            : "empresa";
  // Numa escola queremos TODO o time administrativo (coordenação, direção,
  // orientação, secretaria), não só um contato — puxamos mais decisores.
  const decisoresPorEmpresa = category === "escola" ? 25 : 10;
  // Sindicato: buscar sempre sem filtro de porte (headcount quase nunca existe
  // no Apollo). Vale mesmo que o front não peça — evita "não achou nada".
  const skipEmployees = body.skipEmployees === true || category === "sindicato";

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  let orgs;
  try {
    orgs = await searchCompanies({
      locations: body.locations,
      keywords: body.keywords,
      notKeywords: body.notKeywords,
      name: body.name,
      minEmployees: body.minEmployees ?? 100,
      maxEmployees: body.maxEmployees,
      skipEmployeeRanges: skipEmployees,
      perPage: body.perPage ?? 25,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro no Apollo" },
      { status: 502 },
    );
  }

  const results: { name: string; qualified: boolean; score: number }[] = [];
  let contatosDecisores = 0;
  let puladasSemDecisor = 0;
  let avisoContatos: string | null = null;
  // Diagnóstico (para entender POR QUE uma empresa é descartada):
  let qualificadasSemDominio = 0; // Apollo não deu domínio -> não dá p/ buscar
  let empresasComDecisor = 0; // acharam ao menos 1 decisor
  let decisoresEncontrados = 0; // total de decisores achados (antes do filtro)

  for (const org of orgs) {
    const q = qualifyCompany(org, { category });

    if (q.qualified && !org.domain) qualificadasSemDominio++;

    // 1) Busca os DECISORES (RH, dono, diretor, sócio) — de graça no Apollo,
    //    já traz o STATUS do e-mail de cada um (sem revelar/gastar crédito).
    let decisores: Awaited<ReturnType<typeof searchDecisionMakers>> = [];
    if (withContacts && q.qualified && org.domain) {
      try {
        decisores = await searchDecisionMakers(
          org.domain,
          decisoresPorEmpresa,
          category,
        );
      } catch (err) {
        if (!avisoContatos) {
          avisoContatos =
            err instanceof Error
              ? err.message.slice(0, 200)
              : "Erro ao buscar decisores";
        }
      }
    }
    if (decisores.length > 0) empresasComDecisor++;
    decisoresEncontrados += decisores.length;
    const temDecisor = decisores.length > 0;

    // 2) Filtro: se pedimos "só com decisor" e a empresa qualificada não tem
    //    NENHUM decisor encontrado, nem salva — não polui a lista. (O e-mail
    //    é confirmado depois, no "Abordar", que revela 1 crédito.)
    if (onlyWithContact && q.qualified && !temDecisor) {
      puladasSemDecisor++;
      continue;
    }

    // 3) Upsert por apollo_id para evitar duplicatas.
    const { data: company, error } = await supabase
      .from("companies")
      .upsert(
        {
          apollo_id: org.apolloId,
          category,
          name: org.name,
          domain: org.domain,
          website: org.website,
          industry: org.industry,
          employee_count: org.employeeCount,
          city: org.city,
          state: org.state,
          country: org.country,
          linkedin_url: org.linkedinUrl,
          logo_url: org.logoUrl,
          phone: org.phone,
          status: q.qualified ? "qualificado" : "descartado",
          qualification_score: q.score,
          qualified: q.qualified,
          qualification_notes: q.notes,
          priority: q.priority,
        },
        { onConflict: "apollo_id" },
      )
      .select()
      .single();

    if (error || !company) {
      results.push({ name: org.name, qualified: q.qualified, score: q.score });
      continue;
    }

    await supabase.from("activities").insert({
      company_id: company.id,
      type: "prospeccao",
      description: `Descoberta via Apollo. ${q.qualified ? "Qualificada" : "Descartada"} (score ${q.score}). ${q.notes}`,
    });

    // 4) Salva os decisores encontrados.
    for (const c of decisores) {
      await supabase.from("contacts").upsert(
        {
          company_id: company.id,
          apollo_id: c.apolloId,
          name: c.name,
          title: c.title,
          email: c.email,
          phone: c.phone,
          linkedin_url: c.linkedinUrl,
          email_status: c.emailStatus,
        },
        { onConflict: "apollo_id" },
      );
      contatosDecisores++;
    }

    results.push({ name: org.name, qualified: q.qualified, score: q.score });
  }

  const qualified = results.filter((r) => r.qualified).length;
  return NextResponse.json({
    encontradasNoApollo: orgs.length,
    found: results.length,
    qualified,
    contatosDecisores,
    puladasSemDecisor,
    onlyWithContact,
    // Diagnóstico:
    qualificadasSemDominio,
    empresasComDecisor,
    decisoresEncontrados,
    avisoContatos,
    results,
  });
}
