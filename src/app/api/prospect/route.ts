import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { searchCompanies, searchHrContacts } from "@/lib/apollo";
import { qualifyCompany } from "@/lib/qualify";

// POST /api/prospect
// Busca empresas no Apollo, qualifica, e persiste no banco (com contatos do RH).
// Body: { locations?, keywords?, minEmployees?, perPage?, withContacts? }
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
  };
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
  let contatosRh = 0;
  let avisoContatos: string | null = null;

  for (const org of orgs) {
    const q = qualifyCompany(org);

    // Upsert por apollo_id para evitar duplicatas.
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

    // Opcionalmente busca contatos do RH para empresas qualificadas.
    if (body.withContacts && q.qualified && org.domain) {
      try {
        const contacts = await searchHrContacts(org.domain);
        for (const c of contacts) {
          await supabase.from("contacts").upsert(
            {
              company_id: company.id,
              apollo_id: c.apolloId,
              name: c.name,
              title: c.title,
              email: c.email,
              phone: c.phone,
              linkedin_url: c.linkedinUrl,
            },
            { onConflict: "apollo_id" },
          );
          contatosRh++;
        }
      } catch (err) {
        // Guarda o motivo (ex: plano sem acesso à busca de pessoas) para avisar.
        if (!avisoContatos) {
          avisoContatos =
            err instanceof Error ? err.message.slice(0, 200) : "Erro ao buscar RH";
        }
      }
    }

    results.push({ name: org.name, qualified: q.qualified, score: q.score });
  }

  const qualified = results.filter((r) => r.qualified).length;
  return NextResponse.json({
    found: results.length,
    qualified,
    contatosRh,
    avisoContatos,
    results,
  });
}
