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

function cfg() {
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER ?? process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD;
  const fromName =
    process.env.SMTP_FROM_NAME ?? process.env.GMAIL_FROM_NAME ?? "MenthalHelp";
  return { host, port, user, pass, fromName };
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
}): Promise<void> {
  const { user, fromName } = cfg();
  await getTransporter().sendMail({
    from: `${fromName} <${user}>`,
    to: opts.to,
    subject: opts.subject || "(sem assunto)",
    text: opts.text,
  });
}
