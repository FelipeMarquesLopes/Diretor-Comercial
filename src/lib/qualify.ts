// Lead scoring por segmento (Fase 1.3).
//
// Score 0-100 + prioridade 1-5, com fatores DIFERENTES por segmento e um peso
// forte para a PROXIMIDADE das unidades (quanto mais perto, mais fácil gerar
// paciente). Tudo determinístico (regras) — sem IA, barato e explicável. Os
// motivos ficam em `notes` ("por que este score").

import type { ApolloOrganization } from "./apollo";

export interface QualificationResult {
  score: number; // 0-100
  qualified: boolean;
  priority: number; // 1-5
  notes: string;
}

// Cidades/regiões das unidades MenthalHelp/Therapy Minds — proximidade = ouro.
const UNIT_HINTS = [
  "guarulhos",
  "tucuruvi",
  "zona norte",
  "interlagos",
  "zona sul",
  "bragança",
  "braganca",
  "barueri",
  "alphaville",
];

// Setores onde afastamento por saúde mental tende a pesar mais (frente empresa).
const HIGH_RELEVANCE_INDUSTRIES = [
  "manufacturing",
  "construction",
  "logistics",
  "transportation",
  "retail",
  "hospital",
  "health",
  "call center",
  "information technology",
  "financial services",
];

// Especialidades médicas que mais encaminham para a clínica (frente médico).
const HIGH_REFERRAL_SPECIALTIES = [
  "neuro",
  "psiquiat",
  "pediatr",
  "geriatr",
  "psico",
  "fono",
  "mental",
  "behavioral",
];

// Pontos de proximidade (vale para todos os segmentos).
function proximityPoints(org: ApolloOrganization): { pts: number; note: string } {
  const region = `${org.city ?? ""} ${org.state ?? ""}`.toLowerCase();
  if (UNIT_HINTS.some((h) => region.includes(h)))
    return { pts: 24, note: "Perto de uma unidade" };
  if (
    region.includes("são paulo") ||
    region.includes("sao paulo") ||
    /\bsp\b/.test(region)
  )
    return { pts: 12, note: "Região de São Paulo" };
  if ((org.country ?? "").toLowerCase().includes("brazil"))
    return { pts: 4, note: "Brasil" };
  return { pts: 0, note: "" };
}

function priorityFromScore(score: number): number {
  return score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 35 ? 2 : 1;
}

export function qualifyCompany(
  org: ApolloOrganization,
  opts?: { category?: string },
): QualificationResult {
  const category = opts?.category ?? "empresa";
  const reasons: string[] = [];
  let score = 0;

  const prox = proximityPoints(org);
  const employees = org.employeeCount ?? 0;
  const industry = (org.industry ?? "").toLowerCase();
  const nameIndustry = `${org.name ?? ""} ${industry}`.toLowerCase();

  // ---------- Frente EMPRESA: porte + setor + proximidade + domínio ----------
  if (category === "empresa") {
    // Reprova só se SOUBERMOS que é abaixo de 100 (a busca já pede 100+).
    if (employees > 0 && employees < 100) {
      return {
        score: 0,
        qualified: false,
        priority: 1,
        notes: `Menos de 100 funcionários (${employees}) — abaixo do critério.`,
      };
    }
    if (employees >= 1000) { score += 38; reasons.push(`Grande porte (${employees} func.)`); }
    else if (employees >= 500) { score += 30; reasons.push(`${employees} func.`); }
    else if (employees >= 200) { score += 22; reasons.push(`${employees} func.`); }
    else if (employees >= 100) { score += 15; reasons.push(`${employees} func. (100+)`); }
    else { score += 13; reasons.push("Porte não informado (busca já filtra 100+)"); }

    if (HIGH_RELEVANCE_INDUSTRIES.some((s) => industry.includes(s))) {
      score += 22; reasons.push(`Setor relevante (${org.industry})`);
    } else if (industry) { score += 8; reasons.push(`Setor: ${org.industry}`); }

    if (prox.pts) { score += prox.pts; reasons.push(prox.note); }
    if (org.domain) { score += 8; reasons.push("Domínio identificado"); }

    score = Math.min(100, score);
    return { score, qualified: true, priority: priorityFromScore(score), notes: reasons.join("; ") };
  }

  // ---------- Frente MÉDICO: especialidade encaminhadora + proximidade -------
  if (category === "medico") {
    score += 32; reasons.push("Encaminhador em potencial");
    if (HIGH_REFERRAL_SPECIALTIES.some((s) => nameIndustry.includes(s))) {
      score += 22; reasons.push("Especialidade de alto encaminhamento");
    }
    if (prox.pts) { score += Math.round(prox.pts * 1.1); reasons.push(prox.note + " (chave p/ médicos)"); }
    if (org.domain) { score += 6; reasons.push("Domínio identificado"); }
    score = Math.min(100, score);
    return { score, qualified: true, priority: priorityFromScore(score), notes: reasons.join("; ") };
  }

  // ---------- Frente ESCOLA: proximidade + porte leve ------------------------
  if (category === "escola") {
    score += 34; reasons.push("Gera encaminhamento (alunos)");
    if (prox.pts) { score += prox.pts; reasons.push(prox.note); }
    if (employees >= 50) { score += 8; reasons.push("Porte relevante"); }
    if (org.domain) { score += 8; reasons.push("Domínio identificado"); }
    score = Math.min(100, score);
    return { score, qualified: true, priority: priorityFromScore(score), notes: reasons.join("; ") };
  }

  // ---------- Frente IGREJA: rede de apoio às famílias + proximidade ---------
  if (category === "igreja") {
    score += 34; reasons.push("Rede de apoio às famílias");
    if (prox.pts) { score += prox.pts; reasons.push(prox.note); }
    if (org.domain) { score += 8; reasons.push("Domínio identificado"); }
    score = Math.min(100, score);
    return { score, qualified: true, priority: priorityFromScore(score), notes: reasons.join("; ") };
  }

  // ---------- Operadora e demais segmentos: base + proximidade ---------------
  score += 45; reasons.push("Potencial de credenciamento/parceria");
  if (prox.pts) { score += prox.pts; reasons.push(prox.note); }
  if (org.domain) { score += 8; reasons.push("Domínio identificado"); }
  score = Math.min(100, score);
  return { score, qualified: true, priority: priorityFromScore(score), notes: reasons.join("; ") };
}
