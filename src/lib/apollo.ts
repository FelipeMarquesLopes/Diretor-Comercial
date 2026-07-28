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
}

export interface CompanySearchParams {
  // Localizações (ex: ["Sao Paulo, Brazil", "Brazil"])
  locations?: string[];
  // Palavras-chave de setor/indústria
  keywords?: string[];
  // Faixa mínima de funcionários — default 100+ (critério do brief)
  minEmployees?: number;
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
function employeeRanges(minEmployees: number): string[] {
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
    const upper = parseInt(r.split(",")[1], 10);
    return upper >= minEmployees;
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
    minEmployees = 100,
    page = 1,
    perPage = 25,
  } = params;

  const body: Record<string, unknown> = {
    page,
    per_page: perPage,
    organization_num_employees_ranges: employeeRanges(minEmployees),
    organization_locations: locations,
  };
  if (keywords.length > 0) {
    body.q_organization_keyword_tags = keywords;
  }

  const data = await apolloPost<{
    organizations?: RawOrg[];
    accounts?: RawOrg[];
  }>("/mixed_companies/search", body);

  const orgs = [...(data.organizations ?? []), ...(data.accounts ?? [])];
  return orgs.map(normalizeOrg).filter((o) => o.apolloId);
}

/**
 * Busca contatos do RH em uma empresa (por domínio da organização).
 */
export async function searchHrContacts(
  organizationDomain: string,
  perPage = 5,
): Promise<ApolloContact[]> {
  const body = {
    page: 1,
    per_page: perPage,
    q_organization_domains_list: [organizationDomain],
    person_titles: [
      "Human Resources",
      "HR",
      "People",
      "Recursos Humanos",
      "Gente e Gestão",
      "Diretor de RH",
      "Gerente de RH",
      "Health",
      "Benefits",
      "Benefícios",
    ],
  };

  const data = await apolloPost<{ people?: RawPerson[]; contacts?: RawPerson[] }>(
    "/mixed_people/search",
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
): Promise<{ email: string | null; phone: string | null }> {
  const data = await apolloPost<{ person?: RawPerson }>("/people/match", {
    id: apolloId,
  });
  const p = data.person;
  if (!p) return { email: null, phone: null };
  return {
    email: p.email && !p.email.includes("not_unlocked") ? p.email : null,
    phone: p.phone_numbers?.[0]?.raw_number ?? null,
  };
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
  };
}
