// Envio de e-mail por SMTP (funciona com qualquer provedor: Titan, Gmail, etc.).
//
// Configuração por variáveis de ambiente:
//   SMTP_HOST      servidor de envio (ex: smtp.titan.email, smtp.gmail.com)
//   SMTP_PORT      porta (padrão 465, com SSL)
//   SMTP_USER      o e-mail remetente (ex: felipe@clinicamenthalhelp.com.br)
//   SMTP_PASSWORD  a senha do e-mail
//   SMTP_FROM_NAME nome que aparece como remetente (padrão MenthalHelp)
//
// Compatibilidade: se SMTP_* não estiver definido, cai para as variáveis
// antigas GMAIL_USER / GMAIL_APP_PASSWORD (host padrão smtp.gmail.com).
//
// Enquanto nada estiver configurado, o app continua funcionando — o e-mail
// aparece como "pronto para enviar" e o CEO envia por fora, sem quebrar nada.

import nodemailer from "nodemailer";
import { EMAIL_FONT_FAMILY, EMAIL_FONT_SIZE } from "./branding";
import { senderConfig, DEFAULT_BRAND, type BrandId } from "./brands";

// Rodapé de descadastro (LGPD — legítimo interesse em outreach B2B). Anexado
// automaticamente a TODO envio, para o destinatário poder pedir para sair.
// Ao responder "SAIR", o leitor de caixa capta e bloqueia o e-mail sozinho.
const OPTOUT_TEXT =
  'Se não deseja mais receber nossos contatos, responda este e-mail com "SAIR" ' +
  "e removeremos seu endereço.";

// Converte o texto do rascunho em HTML com a fonte pedida (Arial 13),
// preservando as quebras de linha.
function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    `<div style="font-family:${EMAIL_FONT_FAMILY};font-size:${EMAIL_FONT_SIZE};` +
    `line-height:1.5;color:#222222;white-space:normal;">` +
    escaped.replace(/\n/g, "<br>") +
    `</div>`
  );
}

// Configuração do remetente por MARCA (MenthalHelp / Therapy Minds).
function cfg(brand: BrandId = DEFAULT_BRAND) {
  return senderConfig(brand);
}

// Considera o e-mail configurado se QUALQUER marca tiver remetente pronto (a
// MenthalHelp, por padrão). Aceita conferir uma marca específica.
export function isEmailConfigured(brand?: BrandId): boolean {
  const { user, pass } = cfg(brand);
  return Boolean(user && pass);
}

// Um transporter por marca (contas de envio diferentes).
const transporters = new Map<BrandId, nodemailer.Transporter>();
function getTransporter(brand: BrandId): nodemailer.Transporter {
  const { host, port, user, pass } = cfg(brand);
  if (!user || !pass) {
    const extra =
      brand === "therapy_minds"
        ? "Defina SMTP_USER_TM e SMTP_PASSWORD_TM (remetente da Therapy Minds)."
        : "Defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD (veja o README, 'Conectar o e-mail').";
    throw new Error(`E-mail da marca não configurado. ${extra}`);
  }
  let t = transporters.get(brand);
  if (!t) {
    t = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL; 587 = STARTTLS
      auth: { user, pass },
      // Timeouts explícitos: falha rápido e limpo (em vez de pendurar a função)
      // quando o servidor demora ou derruba a conexão.
      connectionTimeout: 20000,
      greetingTimeout: 15000,
      socketTimeout: 25000,
    });
    transporters.set(brand, t);
  }
  return t;
}

// Erros de CONEXÃO transitórios (o servidor derrubou/expirou) — vale retentar.
function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /connection closed|econnreset|etimedout|epipe|esocket|socket close|timeout|greeting never received|closed unexpectedly/i.test(
    msg,
  );
}

// Envia com até 3 tentativas e espera crescente (2s, 4s). Em falha de conexão,
// descarta o transporte para reconectar do zero na próxima tentativa.
async function sendMailWithRetry(
  brand: BrandId,
  mailOptions: Parameters<nodemailer.Transporter["sendMail"]>[0],
): Promise<{ messageId?: string }> {
  const maxTentativas = 3;
  let ultimoErro: unknown;
  for (let i = 0; i < maxTentativas; i++) {
    try {
      return await getTransporter(brand).sendMail(mailOptions);
    } catch (err) {
      ultimoErro = err;
      if (!isTransient(err) || i === maxTentativas - 1) throw err;
      transporters.delete(brand); // força reconexão limpa
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw ultimoErro;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  // E-mails extras em cópia (ex: outras pessoas da operadora). Opcional.
  extraCc?: string[];
  // Anexos (documentos que vão junto no e-mail). Opcional.
  attachments?: { filename: string; content: Buffer }[];
  // Threading: amarra este e-mail na mesma conversa da mensagem anterior.
  inReplyTo?: string;
  references?: string;
  // Marca dona do lead — define de qual conta/remetente o e-mail sai.
  brand?: BrandId;
}): Promise<{ messageId?: string }> {
  const brand = opts.brand ?? DEFAULT_BRAND;
  const { user, fromName, cc } = cfg(brand);
  // Monta a cópia: e-mail de monitoramento do CEO + extras informados.
  // Remove duplicatas e nunca repete o próprio destinatário.
  const seen = new Set<string>([opts.to.toLowerCase()]);
  const ccList: string[] = [];
  for (const e of [cc, ...(opts.extraCc ?? [])]) {
    const addr = (e ?? "").trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ccList.push(addr);
  }
  // Corpo em texto + rodapé de descadastro (LGPD).
  const textComOptout = `${opts.text}\n\n—\n${OPTOUT_TEXT}`;
  const htmlOptout =
    `<p style="font-family:${EMAIL_FONT_FAMILY};font-size:11px;` +
    `color:#9aa0a6;margin-top:18px;border-top:1px solid #eee;padding-top:10px;">` +
    OPTOUT_TEXT +
    `</p>`;
  const info = await sendMailWithRetry(brand, {
    from: `${fromName} <${user}>`,
    to: opts.to,
    cc: ccList.length > 0 ? ccList : undefined, // CEO + extras em cópia
    subject: opts.subject || "(sem assunto)",
    text: textComOptout, // fallback em texto puro + opt-out
    html: toHtml(opts.text) + htmlOptout, // versão Arial 13 + rodapé opt-out
    attachments:
      opts.attachments && opts.attachments.length > 0
        ? opts.attachments
        : undefined,
    inReplyTo: opts.inReplyTo || undefined,
    references: opts.references || undefined,
  });
  return { messageId: info.messageId };
}
