// Fase 2.3 — Lead scoring v2 (sinais + histórico).
//
// O score da Fase 1.3 (qualify.ts) é ESTÁTICO: fotografa o lead no momento da
// descoberta (porte, setor, proximidade). A v2 acrescenta uma camada DINÂMICA
// que faz o lead "esquentar" conforme ele INTERAGE: respostas positivas,
// avanço no pipeline, e-mail alcançável — ou "esfriar": recusas, descadastro,
// silêncio. Recalcula de forma ESTÁVEL (base recomputada + delta), então rodar
// várias vezes não infla o número.
//
// Princípio inviolável: mede o RELACIONAMENTO comercial com o parceiro. Nunca
// há dado de paciente.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApolloOrganization } from "./apollo";
import { qualifyCompany } from "./qualify";
import { resolveStageId, stagesFor } from "./pipelines";
import type { Company, Contact } from "./types";

// Reconstrói o "organização Apollo" a partir da empresa salva, para recomputar
// a base estática sem depender do valor já gravado (evita drift).
function toOrg(company: Company): ApolloOrganization {
  return {
    apolloId: company.apollo_id ?? "",
    name: company.name,
    domain: company.domain,
    website: company.website,
    industry: company.industry,
    employeeCount: company.employee_count,
    city: company.city,
    state: company.state,
    country: company.country,
    linkedinUrl: company.linkedin_url,
    logoUrl: company.logo_url,
    phone: company.phone,
  };
}

function priorityFromScore(score: number): number {
  return score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 35 ? 2 : 1;
}

export interface RescoreResult {
  score: number;
  priority: number;
  notes: string;
}

/**
 * Recalcula o score de um parceiro combinando a base estática (qualify.ts) com
 * sinais dinâmicos (respostas, avanço no pipeline, alcançabilidade) e grava o
 * resultado. Retorna o novo score/prioridade/motivos.
 */
export async function recomputeCompanyScore(
  supabase: SupabaseClient,
  companyId: string,
): Promise<RescoreResult | null> {
  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single<Company>();
  if (!company) return null;

  // 1) Base estática (mesma régua da descoberta) — sem os "motivos" longos.
  const base = qualifyCompany(toOrg(company), { category: company.category });
  let score = base.score;
  const reasons: string[] = [];

  // 2) Sinais dinâmicos --------------------------------------------------
  const [{ data: responses }, { data: contacts }, { data: lastAct }] =
    await Promise.all([
      supabase.from("responses").select("sentiment").eq("company_id", companyId),
      supabase.from("contacts").select("email_verdict").eq("company_id", companyId),
      supabase
        .from("activities")
        .select("created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const resp = (responses as { sentiment: string }[] | null) ?? [];
  const positivas = resp.filter((r) => r.sentiment === "positivo").length;
  const negativas = resp.filter((r) => r.sentiment === "negativo").length;

  if (positivas) {
    const add = Math.min(30, positivas * 12);
    score += add;
    reasons.push(`${positivas} resposta(s) positiva(s) (+${add})`);
  }
  if (negativas) {
    const sub = Math.min(40, negativas * 15);
    score -= sub;
    reasons.push(`${negativas} recusa(s)/negativa(s) (−${sub})`);
  }

  // Avanço no pipeline: quanto mais fundo, mais quente.
  const stages = stagesFor(company.category);
  if (stages.length > 1) {
    const sid = resolveStageId(company.category, company.stage, company.status);
    const idx = stages.findIndex((s) => s.id === sid);
    if (idx > 0) {
      const add = Math.round((idx / (stages.length - 1)) * 15);
      if (add) {
        score += add;
        reasons.push(`avançou no pipeline (+${add})`);
      }
    }
  }

  // Alcançabilidade: já temos e-mail válido para falar.
  const temValido = ((contacts as Contact[] | null) ?? []).some(
    (c) => c.email_verdict === "valid",
  );
  if (temValido) {
    score += 6;
    reasons.push("e-mail válido em mãos (+6)");
  }

  // Recência da última interação (engajamento recente aquece).
  const lastIso = (lastAct as { created_at: string }[] | null)?.[0]?.created_at;
  if (lastIso) {
    const dias = (Date.now() - new Date(lastIso).getTime()) / 86400000;
    if (dias <= 7) {
      score += 8;
      reasons.push("interação nos últimos 7 dias (+8)");
    } else if (dias <= 30) {
      score += 4;
      reasons.push("interação no último mês (+4)");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const priority = priorityFromScore(score);

  // Motivos: base (do qualify) + a camada dinâmica, para ficar explicável.
  const notes = [base.notes, reasons.length ? `Sinais: ${reasons.join("; ")}` : ""]
    .filter(Boolean)
    .join(" — ");

  await supabase
    .from("companies")
    .update({
      qualification_score: score,
      priority,
      qualification_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  return { score, priority, notes };
}
