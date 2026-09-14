// Duas MARCAS no mesmo sistema: MenthalHelp e Therapy Minds.
//
// Decisões do CEO (14/09/2026):
//   • Mesma oferta/estrutura, divididas por região/unidade;
//   • BASES DE LEADS SEPARADAS (cada parceiro pertence a uma marca);
//   • REMETENTE SEPARADO (o e-mail sai da marca dona do lead).
//
// A MenthalHelp é a marca PADRÃO — tudo que já existe continua nela, com o
// comportamento atual intacto (assinatura, remetente e textos inalterados).
// A Therapy Minds usa a MESMA oferta (mesma lista de serviços), com assinatura
// e remetente próprios.

import {
  CLINIC_SERVICES,
  EMAIL_SIGNATURE,
  MENTHAL_UNITS,
  THERAPY_MINDS_UNITS,
} from "./branding";

export type BrandId = "menthalhelp" | "therapy_minds";

export interface Brand {
  id: BrandId;
  label: string; // nome comercial (usado na assinatura e no corpo do e-mail)
  short: string; // rótulo curto (seletor)
  accent: string; // cor para o seletor/etiqueta
  signature: string; // assinatura fixa (fim de todo e-mail)
  services: string; // lista de serviços (apresentação inicial)
  units: string[]; // unidades/regiões
}

// Assinatura da Therapy Minds. Reutiliza o que é comum (o CEO é sócio-diretor
// das duas) e puxa CNPJ/telefones de variáveis de ambiente quando existirem —
// nunca inventamos dados: se não houver, a linha simplesmente não aparece.
const TM_SIGNATURE = [
  "Sócio-Diretor - Felipe Marques",
  "Therapy Minds",
  process.env.BRAND_TM_CNPJ ? `CNPJ: ${process.env.BRAND_TM_CNPJ}` : null,
  "Administrativo",
  process.env.BRAND_TM_TEL ? `Tel: ${process.env.BRAND_TM_TEL}` : null,
  process.env.BRAND_TM_WHATSAPP ? `WhatsApp: ${process.env.BRAND_TM_WHATSAPP}` : null,
]
  .filter(Boolean)
  .join("\n");

export const BRANDS: Record<BrandId, Brand> = {
  menthalhelp: {
    id: "menthalhelp",
    label: "MenthalHelp",
    short: "MenthalHelp",
    accent: "#6d28d9", // roxo (brand atual)
    signature: EMAIL_SIGNATURE, // inalterada — a atual, perfeita
    services: CLINIC_SERVICES,
    units: MENTHAL_UNITS,
  },
  therapy_minds: {
    id: "therapy_minds",
    label: "Therapy Minds",
    short: "Therapy Minds",
    accent: "#0d9488", // teal (distingue no seletor)
    signature: TM_SIGNATURE,
    services: CLINIC_SERVICES, // mesma oferta
    units: THERAPY_MINDS_UNITS, // exclusivamente Zona Sul (Interlagos)
  },
};

export const DEFAULT_BRAND: BrandId = "menthalhelp";

export function isBrandId(v: unknown): v is BrandId {
  return v === "menthalhelp" || v === "therapy_minds";
}

export function getBrand(id?: string | null): Brand {
  return isBrandId(id) ? BRANDS[id] : BRANDS[DEFAULT_BRAND];
}

// Lê a marca ativa do cabeçalho Cookie (o seletor no topo grava o cookie
// `marca`). O navegador manda o cookie em toda chamada same-origin, então as
// rotas sabem a marca ativa sem que o cliente precise passar em cada fetch.
export function brandFromCookie(cookieHeader?: string | null): BrandId {
  if (!cookieHeader) return DEFAULT_BRAND;
  const m = cookieHeader.match(/(?:^|;\s*)marca=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : null;
  return isBrandId(v) ? v : DEFAULT_BRAND;
}

// Marca ativa a partir da requisição (cookie) — com override opcional por
// query/body para casos explícitos (?brand=therapy_minds).
export function brandFromRequest(req: Request, override?: string | null): BrandId {
  if (isBrandId(override)) return override;
  return brandFromCookie(req.headers.get("cookie"));
}

// Configuração de REMETENTE (SMTP) por marca. A MenthalHelp mantém exatamente
// as variáveis atuais; a Therapy Minds usa as suas (*_TM), caindo para as da
// MenthalHelp só no host/porta (mesmo provedor Titan), mas nunca no usuário/
// senha — assim nunca enviamos por engano pela conta errada.
export function senderConfig(brand: BrandId): {
  host: string;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  fromName: string;
  cc: string;
} {
  if (brand === "therapy_minds") {
    // A Therapy Minds envia pelo Google Workspace (Gmail). Host/porta padrão do
    // Gmail; user = e-mail do Workspace, pass = SENHA DE APP (não a senha normal
    // — o Gmail exige senha de app para SMTP). Tudo via env, nunca no código.
    return {
      host: process.env.SMTP_HOST_TM ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT_TM ?? "465"),
      user: process.env.SMTP_USER_TM,
      pass: process.env.SMTP_PASSWORD_TM,
      fromName: process.env.SMTP_FROM_NAME_TM ?? "Therapy Minds",
      cc: process.env.EMAIL_CC_TM ?? process.env.EMAIL_CC ?? "",
    };
  }
  return {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? "465"),
    user: process.env.SMTP_USER ?? process.env.GMAIL_USER,
    pass: process.env.SMTP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD,
    fromName: process.env.SMTP_FROM_NAME ?? process.env.GMAIL_FROM_NAME ?? "MenthalHelp",
    cc: process.env.EMAIL_CC ?? "felipe@clinicamenthalhelp.com.br",
  };
}
