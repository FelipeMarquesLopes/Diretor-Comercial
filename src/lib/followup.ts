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

/**
 * Intervalo (em milissegundos) até a PRÓXIMA mensagem, dado o passo que
 * acabou de sair. `stepJustSent` = quantas mensagens já saíram neste canal
 * (1 = acabou de sair a primeira).
 */
export function intervalMs(channel: SequenceChannel, stepJustSent: number): number {
  if (channel === "email") {
    // Sempre de 3 em 3 dias.
    return 3 * DIA;
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
): Date {
  return new Date(lastSent.getTime() + intervalMs(channel, stepJustSent));
}

/**
 * Horário de retomada após uma resposta negativa (30 dias depois).
 */
export function resumeAtAfterNegative(from: Date = new Date()): Date {
  return new Date(from.getTime() + DIAS_RETOMADA_NEGATIVA * DIA);
}
