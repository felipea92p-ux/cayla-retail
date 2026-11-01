// Estados financieros ▸ ¿Lo tuyo creció? (estado de cambios en el patrimonio; ADR-0585, actividad 7).
//
// PROMETE: lo tuyo del mes contado como un puente (al empezar → lo que ganaste → lo que pusiste → lo que retiraste → al cerrar), la frase
// que dice qué parte de lo ganado retiraste, la línea de lo tuyo mes a mes, el cuadro formal (capital, aportes y resultados por columna)
// y las recomendaciones.
// ASUME: toda cifra viene de `fn_patrimonio_cambios` (el mismo diario que el Balance). Aquí no se suma plata nueva: se ordena lo que la
// base dio. Lo que la ganancia, los aportes y los retiros no explican (`otros`) se muestra aparte, nunca se esconde.

import { soles } from "./flujo-caja-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";
import type { Recomendacion } from "./ganamos-reglas";
import type { FilaCascada } from "./cascada-estados-reglas";

type ConExtremos = PatrimonioCambios & { inicio: NonNullable<PatrimonioCambios["inicio"]>; fin: NonNullable<PatrimonioCambios["fin"]> };

/** Hay con qué contar lo tuyo: los saldos de arranque están y la base dio los dos extremos del mes. */
export const tieneExtremos = (p: PatrimonioCambios | null): p is ConExtremos => !!p && !p.sinArranque && !!p.inicio && !!p.fin;

const r2 = (n: number) => Math.round(n * 100) / 100;
const pesa = (n: number) => Math.round(n) !== 0;

/** Cuánto cambió lo tuyo en el mes (al cerrar − al empezar). */
export const cambioDelMes = (p: ConExtremos) => r2(p.fin.total - p.inicio.total);

/** «Qué lo movió», como la cascada de la maqueta: lo que ganaste (o perdiste), lo que pusiste, lo que retiraste y lo que la base no
 *  explica, cada uno con su signo y sin los que son cero; al final, cuánto creció (o bajó). Las filas suman el final. */
export function filasTuyo(p: ConExtremos): FilaCascada[] {
  const filas: FilaCascada[] = [];
  if (pesa(p.ganancia))
    filas.push({ clave: "ganancia", nombre: p.ganancia >= 0 ? "Lo que ganaste" : "Lo que perdiste", detalle: "Viene de ¿Ganamos?", valor: r2(p.ganancia), tipo: "paso" });
  if (pesa(p.aportes)) filas.push({ clave: "aportes", nombre: "Lo que pusiste", detalle: "Aportes", valor: r2(p.aportes), tipo: "paso" });
  if (pesa(p.retiros)) filas.push({ clave: "retiros", nombre: "Lo que retiraste", detalle: "Utilidades que sacaste para ti", valor: r2(-p.retiros), tipo: "paso" });
  if (pesa(p.otros)) filas.push({ clave: "otros", nombre: "Sin explicar", detalle: "Un ajuste a mano: el Balance dice de dónde sale", valor: r2(p.otros), tipo: "paso" });
  const cambio = cambioDelMes(p);
  filas.push({ clave: "cambio", nombre: Math.round(cambio) >= 0 ? "Creció" : "Bajó", valor: cambio, tipo: "final" });
  return filas;
}

/** La frase bajo la respuesta: qué parte de lo ganado retiraste, o por qué bajó. */
export function fraseTuyo(p: ConExtremos): string {
  const g = Math.round(p.ganancia);
  const r = Math.round(p.retiros);
  const a = Math.round(p.aportes);
  const puso = a > 0 ? ` y pusiste ${soles(a)}` : "";
  if (g > 0 && r > 0) {
    const pct = Math.round((r / g) * 100);
    return r > g ? `Ganaste ${soles(g)} y retiraste ${soles(r)}: más de lo que ganaste${puso}.` : `De los ${soles(g)} que ganaste, retiraste ${soles(r)}: el ${pct} %${puso}.`;
  }
  if (g > 0) return `Ganaste ${soles(g)} y no retiraste nada${puso}.`;
  if (g < 0) return `Perdiste ${soles(-g)} en el mes${r > 0 ? ` y retiraste ${soles(r)}` : ""}${puso}.`;
  if (r > 0) return `No hubo ganancia y retiraste ${soles(r)}${puso}.`;
  return a > 0 ? `Pusiste ${soles(a)}.` : "No se movió en el mes.";
}

/** Cuántos meses seguidos bajó lo tuyo, contando hacia atrás desde el último cierre de la serie. */
export function mesesBajando(serie: PatrimonioCambios["serie"]): number {
  let n = 0;
  for (let i = serie.length - 1; i > 0; i--) {
    if (Math.round(serie[i]!.total) < Math.round(serie[i - 1]!.total)) n++;
    else break;
  }
  return n;
}

/** Desde cuántos meses seguidos bajando conviene decirlo. */
export const MESES_BAJANDO_QUE_IMPORTAN = 2;

export type FilaFormalPatrimonio = { clave: string; nombre: string; capital: number; aportes: number; utilidades: number; total: number; fuerte?: boolean };

/**
 * El estado de cambios en el patrimonio en su formato formal: cada columna (capital, aportes, resultados acumulados) desde su saldo al
 * empezar hasta el de cerrar. Lo que la ganancia, los aportes y los retiros no explican cae en «Otros ajustes» de su columna, así cada
 * columna suma; la fila solo aparece si pesa.
 */
export function cuadroFormalPatrimonio(p: ConExtremos): FilaFormalPatrimonio[] {
  const fila = (clave: string, nombre: string, capital: number, aportes: number, utilidades: number, fuerte = false): FilaFormalPatrimonio => ({
    clave,
    nombre,
    capital: r2(capital),
    aportes: r2(aportes),
    utilidades: r2(utilidades),
    total: r2(capital + aportes + utilidades),
    ...(fuerte ? { fuerte } : {}),
  });
  const otrosCap = p.fin.capital - p.inicio.capital;
  const otrosApo = p.fin.aportes - p.inicio.aportes - p.aportes;
  const otrosUti = p.fin.utilidades - p.inicio.utilidades - p.ganancia + p.retiros;
  const filas = [
    fila("inicio", "Saldo al inicio del mes", p.inicio.capital, p.inicio.aportes, p.inicio.utilidades, true),
    fila("ganancia", "Resultado del mes", 0, 0, p.ganancia),
    fila("aportes", "Aportes del dueño", 0, p.aportes, 0),
    fila("retiros", "Retiro de utilidades", 0, 0, -p.retiros),
  ];
  if ([otrosCap, otrosApo, otrosUti].some(pesa)) filas.push(fila("otros", "Otros ajustes", otrosCap, otrosApo, otrosUti));
  filas.push(fila("fin", "Saldo al cierre del mes", p.fin.capital, p.fin.aportes, p.fin.utilidades, true));
  return filas;
}

/**
 * Qué te recomiendo en ¿Lo tuyo creció? (hasta 3, la más urgente arriba). Sale de lo que la pantalla ya muestra: si retiraste más de lo
 * que ganaste (o una parte grande), si perdiste, si lo tuyo viene bajando y si hay algo sin explicar. Ninguna inventa una regla.
 */
export function recomendacionesTuyo({ datos, href }: { datos: PatrimonioCambios | null; href: (ruta: string) => string }): Recomendacion[] {
  if (!tieneExtremos(datos)) return [];
  const out: Recomendacion[] = [];
  const g = datos.ganancia;
  const r = datos.retiros;
  const cambio = cambioDelMes(datos);
  if (pesa(datos.otros)) {
    out.push({
      clave: "otros",
      tono: "atencion",
      prioridad: 1,
      titulo: `${soles(Math.abs(datos.otros))} sin explicar`,
      texto: "Lo tuyo se movió a mano, sin una venta, un gasto, un aporte ni un retiro. Pídele al contador que lo revise.",
      accion: { texto: "Ver el Balance", href: href("/finanzas/reportes/balance") },
    });
  }
  if (Math.round(g) > 0 && Math.round(r) > Math.round(g)) {
    out.push({
      clave: "retiro-mayor",
      tono: "atencion",
      prioridad: 2,
      titulo: "Retiraste más de lo que ganaste",
      texto: `Sacaste ${soles(r - g)} de lo que ya tenía CAYLA. Retirando como mucho lo ganado, lo tuyo no baja.`,
    });
  } else if (Math.round(g) > 0 && r > g / 2) {
    const mitad = g / 2;
    out.push({
      clave: "retiro-alto",
      tono: "info",
      prioridad: 4,
      titulo: `Retiraste el ${Math.round((r / g) * 100)} % de lo ganado`,
      texto: `Retirando la mitad, ${soles(mitad)}, lo tuyo habría crecido ${soles(cambio + r - mitad)} en vez de ${soles(cambio)}.`,
    });
  }
  if (Math.round(g) < 0) {
    out.push({
      clave: "perdida",
      tono: "atencion",
      prioridad: 3,
      titulo: `Perdiste ${soles(-g)} en el mes`,
      texto: "La pérdida baja lo tuyo igual que un retiro. En ¿Ganamos? ves qué gasto se pasó.",
      accion: { texto: "Ver ¿Ganamos?", href: href("/finanzas/reportes") },
    });
  }
  const bajando = mesesBajando(datos.serie);
  if (bajando >= MESES_BAJANDO_QUE_IMPORTAN) {
    const primero = datos.serie[datos.serie.length - 1 - bajando]!;
    const ultimo = datos.serie[datos.serie.length - 1]!;
    out.push({
      clave: "bajando",
      tono: "atencion",
      prioridad: 3,
      titulo: `Lo tuyo baja hace ${bajando} meses`,
      texto: `Pasó de ${soles(primero.total)} a ${soles(ultimo.total)}. Mira cuánto retiras contra lo que ganas cada mes.`,
    });
  }
  if (!out.length) {
    out.push({
      clave: "tranquilo",
      tono: "exito",
      prioridad: 9,
      titulo: cambio >= 0 ? `Lo tuyo creció ${soles(cambio)}` : "Nada fuera de lo normal",
      texto: cambio >= 0 ? "Retiraste menos de lo que ganaste y no hay nada sin explicar." : "No hay nada sin explicar.",
    });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}
