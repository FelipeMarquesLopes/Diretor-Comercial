// Fase 2.2 — Agente de personalização (versão LEVE).
//
// Antes de abordar, responde: "por que ESTA organização conversaria conosco?"
// — e entrega esse argumento como um FIO CONDUTOR para o rascunho. A versão
// leve monta o argumento de forma DETERMINÍSTICA a partir do contexto já
// estruturado (segmento, região, unidade mais próxima, serviços compatíveis,
// sinais do lead). Zero token extra, explicável e barato. A versão "pesada"
// (pesquisa web ao vivo) fica para depois, se o retorno justificar.
//
// Princípio inviolável: isto personaliza a ABORDAGEM ao parceiro. Nunca há
// dado de paciente.

import type { Company } from "./types";

// Região textual do lead → unidade MenthalHelp mais próxima (proximidade = ouro).
const UNIT_BY_REGION: { match: string[]; unit: string }[] = [
  { match: ["guarulhos"], unit: "Guarulhos" },
  { match: ["tucuruvi", "zona norte"], unit: "Zona Norte de SP (Tucuruvi)" },
  { match: ["interlagos", "zona sul"], unit: "Zona Sul de SP (Interlagos)" },
  { match: ["bragança", "braganca"], unit: "Bragança Paulista" },
  { match: ["barueri", "alphaville"], unit: "Barueri (Alphaville)" },
];

function nearestUnit(company: Company): string | null {
  const region = `${company.city ?? ""} ${company.state ?? ""}`.toLowerCase();
  for (const r of UNIT_BY_REGION) {
    if (r.match.some((m) => region.includes(m))) return r.unit;
  }
  if (
    region.includes("são paulo") ||
    region.includes("sao paulo") ||
    /\bsp\b/.test(region)
  ) {
    return "Grande São Paulo (várias unidades)";
  }
  return null;
}

// Argumento central por segmento — a "tese" de por que faz sentido a conversa.
function segmentAngle(company: Company): string {
  switch (company.category) {
    case "operadora":
      return company.operator_type === "ativa"
        ? "Já somos parceiros — o encaixe é operacional (ampliar cobertura/procedimentos e manter o bom atendimento aos beneficiários)."
        : "Rede multidisciplinar com forte expertise em TEA/ABA e capacidade real (3.000+ atendimentos/mês) — pronta para credenciar e absorver demanda dos beneficiários.";
    case "empresa":
      return "A NR-1 tornou obrigatória a gestão de riscos psicossociais; um programa estruturado de saúde mental reduz afastamentos (CID-F), presenteísmo e turnover — e muitos colaboradores têm filhos no espectro (nossa especialidade).";
    case "escola":
      return "Podemos ser o canal de cuidado da escola: avaliação e acompanhamento em saúde mental e neurodesenvolvimento (forte em TEA/ABA), apoio à inclusão e suporte à equipe pedagógica — encaminhamento facilitado para as famílias.";
    case "medico":
      return "Rede de encaminhamento mútuo entre colegas: agilidade na marcação, retorno ao médico solicitante e continuidade do cuidado numa clínica multidisciplinar próxima.";
    case "igreja":
      return "Rede de apoio às famílias da comunidade: quando o acolhimento pastoral encontra situações que pedem acompanhamento profissional, a igreja tem para onde indicar com confiança.";
    default:
      return "Parceria que amplia o cuidado às pessoas atendidas por vocês.";
  }
}

// Sinal específico do lead (setor/porte) — reforça o argumento quando existir.
function leadSignal(company: Company): string | null {
  if (company.category === "empresa") {
    const emp = company.employee_count ?? 0;
    if (emp >= 500) return `porte relevante (${emp} colaboradores) — impacto direto no absenteísmo`;
    if (company.industry) return `setor de ${company.industry}`;
  }
  if (company.category === "medico" && company.industry) {
    return `perfil de ${company.industry}`;
  }
  return null;
}

/**
 * Monta o ângulo de personalização usado como fio condutor do rascunho.
 * Retorna "" quando não há nada de concreto além do genérico (o prompt segue
 * sem ele). Curto de propósito — é um guia, não o texto final.
 */
export function buildPersonalizationAngle(company: Company): string {
  const parts: string[] = [];
  parts.push(segmentAngle(company));

  const unit = nearestUnit(company);
  if (unit) {
    parts.push(
      `Proximidade: ${unit} — perto de ${company.name}, o que facilita encaminhamento e relacionamento presencial.`,
    );
  }

  const signal = leadSignal(company);
  if (signal) parts.push(`Sinal do lead: ${signal}.`);

  // Motivos do lead scoring (Fase 1.3) já resumem por que ele é bom.
  if (company.qualification_notes?.trim()) {
    parts.push(`Priorização: ${company.qualification_notes.trim()}.`);
  }

  return parts.join(" ");
}
