import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { searchCompanies, searchDecisionMakers } from "@/lib/apollo";
import { qualifyCompany } from "@/lib/qualify";

// Um decisor é "contatável" quando o Apollo tem um e-mail para ele (verified,
// likely, unverified...). Só "unavailable"/vazio é que não dá para revelar.
function isContactable(emailStatus: string | null): boolean {
  const s = (emailStatus ?? "").toLowerCase();
  return s !== "" && s !== "unavailable";
}

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
    // Quando true (padrão), só salva empresas que TÊM e-mail de decisor para
    // contatar — as sem e-mail são descartadas para não poluir a lista.
    onlyWithEmail?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // "Só com e-mail" exige buscar os decisores (é de graça no Apollo).
  const onlyWithEmail = body.onlyWithEmail !== false;
  const withContacts = body.withContacts !== false || onlyWithEmail;

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
  let puladasSemEmail = 0;
  let avisoContatos: string | null = null;

  for (const org of orgs) {
    const q = qualifyCompany(org);

    // 1) Busca os DECISORES (RH, dono, diretor, sócio) — de graça no Apollo,
    //    já traz o STATUS do e-mail de cada um (sem revelar/gastar crédito).
    let decisores: Awaited<ReturnType<typeof searchDecisionMakers>> = [];
    if (withContacts && q.qualified && org.domain) {
      try {
        decisores = await searchDecisionMakers(org.domain);
      } catch (err) {
        if (!avisoContatos) {
          avisoContatos =
            err instanceof Error
              ? err.message.slice(0, 200)
              : "Erro ao buscar decisores";
        }
      }
    }
    const temEmail = decisores.some((c) => isContactable(c.emailStatus));

    // 2) Filtro: se pedimos "só com e-mail" e a empresa qualificada não tem
    //    NENHUM decisor com e-mail, nem salva — não polui a lista.
    if (onlyWithEmail && q.qualified && !temEmail) {
      puladasSemEmail++;
      continue;
    }

    // 3) Upsert por apollo_id para evitar duplicatas.
    const { data: company, error } = await supabase
      .from("companies")
      .upsert(
        {
          apollo_id: org.apolloId,
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
    found: results.length,
    qualified,
    contatosDecisores,
    puladasSemEmail,
    onlyWithEmail,
    avisoContatos,
    results,
  });
}
