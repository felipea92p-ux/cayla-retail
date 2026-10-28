// «La cola llega a quien vende» (auditoría del ERP, bloque 1, A5; Felipe 2026-10-14). La cola de ventas sin registrar vivía en
// Existencias ▸ Ventas sin registrar y en el «Te toca» del Inicio, que la terminal de ventas nunca ve (aterriza en el mostrador).
// Ahora el pie del ticket dice cuántas prendas sin registrar se vendieron HOY en esta tienda y cuántas siguen por regularizar, con
// el enlace a la mesa para quien ve Existencias. Lógica pura: sin React ni red.
//
// CONTRATO
//   PROMETE: la frase del pie a partir de dos conteos de `prendas_por_regularizar` de la sede: las vendidas hoy (hora de Lima, sin
//            las anuladas) y las que siguen pendientes. Sin nada que decir (0 y 0) o sin poder leer, no hay frase: el pie no
//            inventa un 0 ni estorba.
//   ASUME:   el día de hoy es el de Lima (ADR-0111), que no tiene horario de verano: el instante en que empieza es `aaaa-mm-ddT00:00:00-05:00`.
//   NO HACE: no decide quién ve la mesa (eso es el módulo Existencias, ADR-0306) ni regulariza nada.
import { hoyLima } from "./fechas-lima";

export type ConteoSinRegistrar = { hoy: number; pendientes: number };

/** El instante en que empezó hoy en Lima, en ISO con su zona: para `vendido_en >= …`. */
export function inicioDeHoyLimaIso(ahora: Date = new Date()): string {
  return `${hoyLima(ahora)}T00:00:00-05:00`;
}

export const TEXTO_ENLACE_MESA = "Regularizar";

/** La frase del pie del ticket, o `null` si no hay nada que decir. */
export function fraseSinRegistrar(c: ConteoSinRegistrar | null): string | null {
  if (!c) return null;
  const hoy = c.hoy > 0 ? `Hoy ${c.hoy} sin registrar` : null;
  const pendientes = c.pendientes > 0 ? `${c.pendientes} por regularizar en tu tienda` : null;
  if (!hoy && !pendientes) return null;
  return [hoy, pendientes].filter(Boolean).join(" · ");
}
