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

function cfg() {
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER ?? process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD;
  const fromName =
    process.env.SMTP_FROM_NAME ?? process.env.GMAIL_FROM_NAME ?? "MenthalHelp";
  // E-mail que entra em CÓPIA em todos os disparos (o CEO acompanha por fora).
  const cc = process.env.EMAIL_CC ?? "felipe@clinicamenthalhelp.com.br";
  return { host, port, user, pass, fromName, cc };
}

export function isEmailConfigured(): boolean {
  const { user, pass } = cfg();
  return Boolean(user && pass);
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  const { host, port, user, pass } = cfg();
  if (!user || !pass) {
    throw new Error(
      "E-mail não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD " +
        "(veja o README, seção 'Conectar o e-mail').",
    );
  }
  transporter ??= nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user, pass },
  });
  return transporter;
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
}): Promise<{ messageId?: string }> {
  const { user, fromName, cc } = cfg();
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
  const info = await getTransporter().sendMail({
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
