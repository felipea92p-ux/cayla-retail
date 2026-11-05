// Estados financieros ▸ ¿Lo tuyo creció? (estado de cambios en el patrimonio; ADR-0585, actividad 7).
//
// PROMETE: el cuadro formal (capital, aportes y resultados por columna) y las recomendaciones. Las palabras y las partes de la pantalla están en `estados-patrimonio.ts`.
// ASUME: toda cifra viene de `fn_patrimonio_cambios` (el mismo diario que el Balance). Aquí no se suma plata nueva: se ordena lo que la
// base dio. Lo que la ganancia, los aportes y los retiros no explican (`otros`) se muestra aparte, nunca se esconde.

import { soles } from "./flujo-caja-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";
import type { Recomendacion } from "./ganamos-reglas";

type ConExtremos = PatrimonioCambios & { inicio: NonNullable<PatrimonioCambios["inicio"]>; fin: NonNullable<PatrimonioCambios["fin"]> };

/** Hay con qué contar lo tuyo: los saldos de arranque están y la base dio los dos extremos del mes. */
export const tieneExtremos = (p: PatrimonioCambios | null): p is ConExtremos => !!p && !p.sinArranque && !!p.inicio && !!p.fin;

const r2 = (n: number) => Math.round(n * 100) / 100;
const pesa = (n: number) => Math.round(n) !== 0;

/** Cuánto cambió lo tuyo en el mes (al cerrar − al empezar). */
export const cambioDelMes = (p: ConExtremos) => r2(p.fin.total - p.inicio.total);

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
