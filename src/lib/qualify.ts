// Qualificação de empresas (frente de empresas).
//
// Critério central do brief (seção 3): 100+ funcionários. A descoberta de
// convênio médico e operadora é feita depois, junto ao RH — aqui pontuamos
// o que dá para saber automaticamente a partir do Apollo.

import type { ApolloOrganization } from "./apollo";

export interface QualificationResult {
  score: number; // 0-100
  qualified: boolean;
  priority: number; // 1-5
  notes: string;
}

// Setores onde saúde mental corporativa / afastamento tende a pesar mais.
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

export function qualifyCompany(
  org: ApolloOrganization,
): QualificationResult {
  const reasons: string[] = [];
  let score = 0;

  const employees = org.employeeCount ?? 0;

  // Critério eliminatório: 100+ funcionários.
  if (employees < 100) {
    return {
      score: 0,
      qualified: false,
      priority: 1,
      notes: `Menos de 100 funcionários (${employees}) — abaixo do critério mínimo.`,
    };
  }

  // Porte (quanto maior, mais colaboradores impactados → mais valor).
  if (employees >= 1000) {
    score += 40;
    reasons.push(`Grande porte (${employees} funcionários)`);
  } else if (employees >= 500) {
    score += 32;
    reasons.push(`${employees} funcionários`);
  } else if (employees >= 200) {
    score += 24;
    reasons.push(`${employees} funcionários`);
  } else {
    score += 16;
    reasons.push(`${employees} funcionários (100+)`);
  }

  // Setor relevante para saúde mental / afastamento.
  const industry = (org.industry ?? "").toLowerCase();
  if (HIGH_RELEVANCE_INDUSTRIES.some((s) => industry.includes(s))) {
    score += 25;
    reasons.push(`Setor relevante (${org.industry})`);
  } else if (industry) {
    score += 10;
    reasons.push(`Setor: ${org.industry}`);
  }

  // Localização — foco atual da MenthalHelp é SP e região.
  const region = `${org.city ?? ""} ${org.state ?? ""}`.toLowerCase();
  if (region.includes("são paulo") || region.includes("sao paulo") || region.includes("sp")) {
    score += 25;
    reasons.push("Região de São Paulo (unidades próximas)");
  } else if ((org.country ?? "").toLowerCase().includes("brazil")) {
    score += 10;
    reasons.push("Brasil");
  }

  // Contato disponível (site/domínio) ajuda a abordagem.
  if (org.domain) {
    score += 10;
    reasons.push("Domínio identificado");
  }

  score = Math.min(100, score);

  // Prioridade 1-5 derivada do score.
  const priority =
    score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 35 ? 2 : 1;

  return {
    score,
    qualified: true,
    priority,
    notes: reasons.join("; "),
  };
}
