// Adaptador da API REST do Apollo.io.
//
// Usado para descobrir EMPRESAS (100+ funcionários) e CONTATOS do RH.
// Requer o plano Basic do Apollo — o plano free NÃO libera estas buscas
// (validado no brief, seção 6). A chave vai em APOLLO_API_KEY.
//
// Docs: https://docs.apollo.io/reference/organization-search

const APOLLO_BASE = "https://api.apollo.io/api/v1";

export interface ApolloOrganization {
  apolloId: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  employeeCount: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  phone: string | null;
}

export interface ApolloContact {
  apolloId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  // Status do e-mail no Apollo (antes de revelar): "verified", "likely to
  // engage", "unverified", "unavailable"... Serve para sabermos ANTES de
  // gastar crédito se dá para revelar um e-mail deste decisor.
  emailStatus: string | null;
}

export interface CompanySearchParams {
  // Localizações (ex: ["Guarulhos, Sao Paulo, Brazil", "Sao Paulo, Brazil"])
  locations?: string[];
  // Palavras-chave de setor/indústria a INCLUIR
  keywords?: string[];
  // Palavras-chave a EXCLUIR (não trazer)
  notKeywords?: string[];
  // Nome específico de empresa (opcional)
  name?: string;
  // Faixa de funcionários
  minEmployees?: number;
  maxEmployees?: number;
  page?: number;
  perPage?: number;
}

function apiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error(
      "Apollo não configurado. Defina APOLLO_API_KEY no .env.local " +
        "(precisa do plano Basic — veja .env.example).",
    );
  }
  return key;
}

async function apolloPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Apollo respondeu ${res.status} em ${path}: ${text.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

// Converte a faixa mínima de funcionários no formato de range do Apollo.
// O Apollo espera strings como "101,200", "201,500", etc.
function employeeRanges(minEmployees: number, maxEmployees?: number): string[] {
  const ranges = [
    "1,10",
    "11,20",
    "21,50",
    "51,100",
    "101,200",
    "201,500",
    "501,1000",
    "1001,2000",
    "2001,5000",
    "5001,10000",
    "10001,1000000",
  ];
  return ranges.filter((r) => {
    const [lower, upper] = r.split(",").map((n) => parseInt(n, 10));
    if (upper < minEmployees) return false; // faixa toda abaixo do mínimo
    if (maxEmployees && lower > maxEmployees) return false; // toda acima do máximo
    return true;
  });
}

/**
 * Busca empresas no Apollo conforme os critérios (default: 100+ funcionários).
 */
export async function searchCompanies(
  params: CompanySearchParams,
): Promise<ApolloOrganization[]> {
  const {
    locations = ["Brazil"],
    keywords = [],
    notKeywords = [],
    name,
    minEmployees = 100,
    maxEmployees,
    page = 1,
    perPage = 25,
  } = params;

  const body: Record<string, unknown> = {
    page,
    per_page: perPage,
    organization_num_employees_ranges: employeeRanges(minEmployees, maxEmployees),
    organization_locations: locations,
  };
  if (keywords.length > 0) {
    body.q_organization_keyword_tags = keywords;
  }
  if (notKeywords.length > 0) {
    body.q_organization_not_keyword_tags = notKeywords;
  }
  if (name && name.trim()) {
    body.q_organization_name = name.trim();
  }

  const data = await apolloPost<{
    organizations?: RawOrg[];
    accounts?: RawOrg[];
  }>("/mixed_companies/search", body);

  const orgs = [...(data.organizations ?? []), ...(data.accounts ?? [])];
  return orgs.map(normalizeOrg).filter((o) => o.apolloId);
}

// Cargos-alvo por frente. Empresa = RH + diretoria (quem fecha parceria de
// benefício). Médico = o próprio médico + direção clínica (rede de
// encaminhamento). Buscar "Gerente de RH" num consultório não faz sentido.
const DECISION_TITLES = {
  empresa: [
    // Donos e lideranças (decisores)
    "CEO",
    "Founder",
    "Owner",
    "President",
    "Presidente",
    "Proprietário",
    "Sócio",
    "Sócio-Diretor",
    "Managing Director",
    "Diretor",
    "Diretora",
    "Diretor Geral",
    "Diretor Executivo",
    "Gerente Geral",
    // RH / Gente / Benefícios (ideal para empresas)
    "Human Resources",
    "HR",
    "HRBP",
    "People",
    "People and Culture",
    "Recursos Humanos",
    "Gente e Gestão",
    "Diretor de RH",
    "Gerente de RH",
    "Coordenador de RH",
    "Diretor de Recursos Humanos",
    "Gerente de Recursos Humanos",
    "Diretor de Pessoas",
    "Business Partner",
    "Benefits",
    "Benefícios",
    "Analista de Benefícios",
    // Saúde ocupacional / SESMT / bem-estar — os compradores de NR-1
    // (riscos psicossociais) e de apoio a afastamentos.
    "Saúde e Segurança do Trabalho",
    "Segurança do Trabalho",
    "SESMT",
    "Medicina do Trabalho",
    "Saúde Ocupacional",
    "Engenheiro de Segurança do Trabalho",
    "Técnico de Segurança do Trabalho",
    "Qualidade de Vida",
    "Bem-estar",
    "Well-being",
    "Diretor de Saúde e Segurança",
    "Gerente de Saúde e Segurança",
  ],
  medico: [
    // A direção clínica (quem decide encaminhamentos e parcerias)
    "Diretor Clínico",
    "Diretora Clínica",
    "Diretor Médico",
    "Diretor Técnico",
    "Diretora Técnica",
    "Responsável Técnico",
    "Coordenador Médico",
    "Clinical Director",
    "Medical Director",
    // O próprio médico prescritor / dono do consultório
    "Médico",
    "Médica",
    "Doctor",
    "Physician",
    "Neurologista",
    "Neuropediatra",
    "Psiquiatra",
    "Pediatra",
    "Geriatra",
    "Neurologist",
    "Psychiatrist",
    "Pediatrician",
    // Dono/sócio do consultório
    "Proprietário",
    "Owner",
    "Sócio",
    "Founder",
    "Fundador",
  ],
  operadora: [
    // Setor de CREDENCIAMENTO / rede credenciada (quem credencia prestadores)
    "Gerente de Credenciamento",
    "Coordenador de Credenciamento",
    "Coordenadora de Credenciamento",
    "Supervisor de Credenciamento",
    "Analista de Credenciamento",
    "Assistente de Credenciamento",
    "Auxiliar de Credenciamento",
    "Credenciamento",
    "Gerente de Rede Credenciada",
    "Gerente de Rede",
    "Coordenador de Rede",
    "Gestão de Rede",
    "Relacionamento com Prestadores",
    "Relacionamento com Credenciados",
    "Credentialing",
    "Provider Network",
    "Network Management",
    "Gerente de Rede de Prestadores",
    // Setor COMERCIAL / contratos / parcerias (quem fecha o contrato)
    "Diretor Comercial",
    "Gerente Comercial",
    "Coordenador Comercial",
    "Analista Comercial",
    "Comercial",
    "Gerente de Contratos",
    "Gerente de Parcerias",
    "Gerente de Novos Negócios",
    "Diretor de Operações",
    // Direção (fallback)
    "Diretor",
    "Diretor Geral",
    "CEO",
    "Owner",
    "Sócio",
  ],
  escola: [
    // Direção (quem fecha parceria institucional)
    "Diretor",
    "Diretora",
    "Diretor Geral",
    "Diretor Pedagógico",
    "Diretora Pedagógica",
    "Diretor Escolar",
    "Diretor Administrativo",
    "Diretor Financeiro",
    "Principal",
    "Headmaster",
    "School Director",
    // Coordenação (o coração do time administrativo/pedagógico)
    "Coordenador",
    "Coordenadora",
    "Coordenador Pedagógico",
    "Coordenadora Pedagógica",
    "Coordenador Educacional",
    "Coordenador de Ensino",
    "Coordenador Administrativo",
    "Pedagogical Coordinator",
    // Orientação / apoio ao aluno (porta de entrada do cuidado)
    "Orientador Educacional",
    "Orientadora Educacional",
    "Orientador Pedagógico",
    "Psicólogo Escolar",
    "Psicopedagogo",
    "Psicopedagoga",
    // Gestão / secretaria / mantenedores
    "Gestor Escolar",
    "Supervisor Pedagógico",
    "Secretário Escolar",
    "Secretária Escolar",
    "Mantenedor",
    "Proprietário",
    "Owner",
    "Sócio",
    "Fundador",
  ],
  igreja: [
    // Liderança (decide a parceria institucional / rede de apoio)
    "Pastor",
    "Pastora",
    "Pastor Presidente",
    "Pastor Titular",
    "Reverendo",
    "Padre",
    "Bispo",
    "Ministro",
    "Apóstolo",
    "Líder",
    "Liderança",
    "Presbítero",
    "Diácono",
    // Administração / secretaria / tesouraria
    "Secretário",
    "Secretário Executivo",
    "Administrador",
    "Administrador Eclesiástico",
    "Tesoureiro",
    "Gestor",
    "Diretor",
    // Assistência / ação social (a porta do cuidado às famílias)
    "Coordenador de Ação Social",
    "Coordenador de Assistência Social",
    "Assistente Social",
    "Coordenador de Família",
    "Coordenador de Aconselhamento",
  ],
  sindicato: [
    // Liderança (quem fecha a parceria institucional)
    "Presidente",
    "Presidente do Sindicato",
    "Vice-Presidente",
    "Diretor",
    "Diretora",
    "Diretor Geral",
    "Diretor Executivo",
    "Diretor Administrativo",
    "Diretor Financeiro",
    "Diretor Social",
    "Diretor de Benefícios",
    "Diretor de Relações",
    "President",
    "Director",
    // Secretaria / administração (o dia a dia que operacionaliza convênios)
    "Secretário-Geral",
    "Secretário Geral",
    "Secretário",
    "Secretária",
    "Secretário Executivo",
    "Gerente Administrativo",
    "Coordenador Administrativo",
    "Administrador",
    "Gestor",
    // Convênios / benefícios / parcerias — a porta de entrada do que vendemos
    "Coordenador de Convênios",
    "Coordenadora de Convênios",
    "Responsável por Convênios",
    "Convênios",
    "Gerente de Convênios",
    "Analista de Convênios",
    "Coordenador de Benefícios",
    "Benefícios",
    "Coordenador de Parcerias",
    "Gerente de Parcerias",
    "Relações Institucionais",
    // Comercial / social (fecham ou encaminham a parceria)
    "Diretor Comercial",
    "Gerente Comercial",
    "Coordenador Comercial",
    "Comercial",
    "Assistente Social",
    "Coordenador de Ação Social",
    // Direção (fallback)
    "Owner",
    "Founder",
    "Sócio",
  ],
} as const;

const DECISION_SENIORITIES = {
  empresa: [
    "owner",
    "founder",
    "c_suite",
    "partner",
    "vp",
    "director",
    "head",
    "manager",
  ],
  // Médicos costumam aparecer sem senioridade corporativa clara; não
  // restringimos por senioridade para não perder o próprio prescritor.
  medico: ["owner", "founder", "partner", "director", "head"],
  // Operadora: o setor de credenciamento tem de gerente a AUXILIAR/analista
  // (entry/senior) — precisamos pegar todos, não só a liderança.
  operadora: [
    "c_suite",
    "vp",
    "director",
    "head",
    "manager",
    "senior",
    "entry",
  ],
  // Escola: queremos TODO o time administrativo, não só a diretoria — por isso
  // incluímos manager/head/vp além dos donos e diretores.
  escola: [
    "owner",
    "founder",
    "partner",
    "c_suite",
    "vp",
    "director",
    "head",
    "manager",
  ],
  // Igreja: liderança e administração (pastor, secretaria, ação social).
  igreja: ["owner", "founder", "c_suite", "director", "head", "manager"],
  // Sindicato: time enxuto — da diretoria (presidente/diretores) até o
  // analista/assistente de convênios. Pegamos todos, como na operadora.
  sindicato: [
    "owner",
    "founder",
    "c_suite",
    "vp",
    "director",
    "head",
    "manager",
    "senior",
    "entry",
  ],
} as const;

/**
 * Busca DECISORES em uma empresa (por domínio).
 *
 * - Frente "empresa": RH + diretoria (quem fecha benefício corporativo).
 * - Frente "medico": o próprio médico + direção clínica (rede de
 *   encaminhamento) — NÃO caça RH/Benefícios, que não existe em consultório.
 */
export async function searchDecisionMakers(
  organizationDomain: string,
  perPage = 10,
  category:
    | "empresa"
    | "medico"
    | "escola"
    | "operadora"
    | "igreja"
    | "sindicato" = "empresa",
): Promise<ApolloContact[]> {
  const body = {
    page: 1,
    per_page: perPage,
    q_organization_domains_list: [organizationDomain],
    person_seniorities: DECISION_SENIORITIES[category],
    person_titles: DECISION_TITLES[category],
  };

  // Endpoint NOVO de busca de pessoas (o /mixed_people/search foi descontinuado).
  const data = await apolloPost<{ people?: RawPerson[]; contacts?: RawPerson[] }>(
    "/mixed_people/api_search",
    body,
  );

  const people = [...(data.people ?? []), ...(data.contacts ?? [])];
  return people.map(normalizePerson).filter((p) => p.apolloId);
}

/**
 * "Revela" (enriquece) uma pessoa pelo ID do Apollo — devolve o e-mail de
 * trabalho e o telefone, quando disponíveis. Consome 1 crédito do Apollo.
 */
export async function revealPerson(
  apolloId: string,
): Promise<{ email: string | null; phone: string | null; emailStatus: string | null }> {
  const data = await apolloPost<{ person?: RawPerson }>("/people/match", {
    id: apolloId,
    // Por padrão o Apollo NÃO devolve e-mail pessoal. Pedimos também o pessoal
    // como plano B: se não houver e-mail corporativo, ainda conseguimos falar
    // com o decisor. (Docs Apollo: parâmetro reveal_personal_emails.)
    reveal_personal_emails: true,
  });
  const p = data.person;
  if (!p) return { email: null, phone: null, emailStatus: null };
  // 1º o e-mail corporativo; se vier vazio/bloqueado, tenta um pessoal.
  const work =
    p.email && !p.email.includes("not_unlocked") ? p.email : null;
  const personal =
    p.personal_emails?.find((e) => e && !e.includes("not_unlocked")) ?? null;
  return {
    email: work ?? personal,
    phone: p.phone_numbers?.[0]?.raw_number ?? null,
    // Status do e-mail confirmado na revelação — "verified" é seguro para
    // enviar; "guessed"/"unverified" costumam RETORNAR (bounce).
    emailStatus: p.email_status ?? null,
  };
}

// E-mail "seguro" de enviar: só os que o Apollo marcou como verificados.
// Enviar para adivinhados (guessed/unverified) causa bounces e ameaça a
// reputação/conta de envio.
export function isEmailVerified(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().trim() === "verified";
}

// --- Normalização das respostas cruas do Apollo ----------------------------

interface RawOrg {
  id?: string;
  name?: string;
  primary_domain?: string;
  website_url?: string;
  industry?: string;
  estimated_num_employees?: number;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  logo_url?: string;
  phone?: string;
  primary_phone?: { number?: string };
}

interface RawPerson {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  personal_emails?: string[];
  linkedin_url?: string;
  phone_numbers?: { raw_number?: string }[];
}

function normalizeOrg(o: RawOrg): ApolloOrganization {
  return {
    apolloId: o.id ?? "",
    name: o.name ?? "(sem nome)",
    domain: o.primary_domain ?? null,
    website: o.website_url ?? null,
    industry: o.industry ?? null,
    employeeCount: o.estimated_num_employees ?? null,
    city: o.city ?? null,
    state: o.state ?? null,
    country: o.country ?? null,
    linkedinUrl: o.linkedin_url ?? null,
    logoUrl: o.logo_url ?? null,
    phone: o.phone ?? o.primary_phone?.number ?? null,
  };
}

function normalizePerson(p: RawPerson): ApolloContact {
  const name =
    p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return {
    apolloId: p.id ?? "",
    name: name || "(sem nome)",
    title: p.title ?? null,
    // O Apollo devolve email "email_not_unlocked@domain.com" quando não
    // liberado; tratamos como ausente.
    email:
      p.email && !p.email.includes("not_unlocked") ? p.email : null,
    phone: p.phone_numbers?.[0]?.raw_number ?? null,
    linkedinUrl: p.linkedin_url ?? null,
    emailStatus: p.email_status ?? null,
  };
}
