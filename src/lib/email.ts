// Envio de e-mail pela conta do Gmail da operação.
//
// Usa a forma mais simples e segura para um sistema: uma "senha de app" do
// Google (uma senha exclusiva do sistema, que não é a senha da sua conta).
// Configurada em GMAIL_USER e GMAIL_APP_PASSWORD.
//
// Enquanto não estiver configurado, o app continua funcionando — o e-mail
// aparece como "pronto para enviar" e o CEO envia por fora, sem quebrar nada.

import nodemailer from "nodemailer";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!isEmailConfigured()) {
    throw new Error(
      "Gmail não configurado. Defina GMAIL_USER e GMAIL_APP_PASSWORD no " +
        ".env.local (veja o README, seção 'Conectar o Gmail').",
    );
  }
  transporter ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const fromName = process.env.GMAIL_FROM_NAME ?? "MenthalHelp";
  await getTransporter().sendMail({
    from: `${fromName} <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject || "(sem assunto)",
    text: opts.text,
  });
}
