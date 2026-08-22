// Motor de follow-up: define QUANDO preparar a próxima cutucada.
//
// Regras (definidas pelo CEO):
//  - E-mail: manda o 1º; se ninguém responder, cobra de 3 em 3 dias, SEM
//    limite, até ter retorno.
//  - WhatsApp: manda a 1ª junto; depois cutuca escalonado: 3h → 24h → 48h →
//    e a partir daí sempre de 72 em 72h, até ter retorno.
//  - Resposta POSITIVA: para tudo e chama o CEO.
//  - Resposta NEGATIVA: pausa e retoma o contato depois de 30 dias.

import type { SequenceChannel } from "./types";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Quantos dias esperar até retomar após uma resposta negativa.
export const DIAS_RETOMADA_NEGATIVA = 30;

// Cadência de e-mail POR SEGMENTO (Fase 3.2). O ritmo respeita o tom de cada
// frente: empresa/operadora são mais objetivas; escola e, sobretudo, igreja e
// médico pedem um contato mais espaçado e nada insistente. Em dias.
const EMAIL_DIAS_POR_SEGMENTO: Record<string, number> = {
  empresa: 3,
  operadora: 3,
  reajuste: 3,
  escola: 4,
  medico: 5,
  sindicato: 5,
  igreja: 7,
};
const EMAIL_DIAS_PADRAO = 3;

export function emailIntervalDays(category?: string): number {
  return (category && EMAIL_DIAS_POR_SEGMENTO[category]) || EMAIL_DIAS_PADRAO;
}

/**
 * Intervalo (em milissegundos) até a PRÓXIMA mensagem, dado o passo que
 * acabou de sair. `stepJustSent` = quantas mensagens já saíram neste canal
 * (1 = acabou de sair a primeira). `category` ajusta a cadência de e-mail por
 * segmento (Fase 3.2).
 */
export function intervalMs(
  channel: SequenceChannel,
  stepJustSent: number,
  category?: string,
): number {
  if (channel === "email") {
    // Cadência por segmento (3 a 7 dias), sem limite, até haver retorno.
    return emailIntervalDays(category) * DIA;
  }
  // WhatsApp: escalonado 3h, 24h, 48h, depois 72h para sempre.
  switch (stepJustSent) {
    case 1:
      return 3 * HORA;
    case 2:
      return 24 * HORA;
    case 3:
      return 48 * HORA;
    default:
      return 72 * HORA;
  }
}

/**
 * Calcula o horário da próxima ação a partir do último envio.
 */
export function nextActionAt(
  channel: SequenceChannel,
  stepJustSent: number,
  lastSent: Date = new Date(),
  category?: string,
): Date {
  return new Date(lastSent.getTime() + intervalMs(channel, stepJustSent, category));
}

/**
 * Horário de retomada após uma resposta negativa (30 dias depois).
 */
export function resumeAtAfterNegative(from: Date = new Date()): Date {
  return new Date(from.getTime() + DIAS_RETOMADA_NEGATIVA * DIA);
}
