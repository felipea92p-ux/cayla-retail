// Análisis v4 (ADR-0357, decisión 2 y sus actualizaciones del 2026-10-06): lo que Análisis muestra mientras la tienda todavía no cumple
// las tres condiciones del motor (ADR-0346). Felipe lo decidió al ver producción, donde ninguna tienda cumple: la pantalla abre CON LOS
// DATOS DE HOY y un aviso fijo arriba que dice qué falta y que las cifras pueden fallar; «Ver qué falta» lleva a «Todavía no», que lleva
// el mismo aviso con «Ver con los datos de hoy» para volver. La cifra de «Todavía no» y la del aviso salen de aquí, para que nunca digan
// cosas distintas.

import type { PreparacionAnalisis } from "./analisis-tipos";
import { DIAS_SOSTENIDOS, diaAntes, fechaCorta, UMBRAL_IDENTIFICADA, type ClaveCondicion } from "./motor-demanda-reglas";

/**
 * Qué se ve:
 * - `confiable`: la tienda cumple las tres condiciones; nada que avisar.
 * - `datos-de-hoy`: no cumple, y se ve todo igual con el aviso fijo (lo que abre por defecto).
 * - `que-falta`: no cumple, y se pidió ver qué falta («Todavía no»).
 */
export type ModoAnalisis = "confiable" | "datos-de-hoy" | "que-falta";

export function modoAnalisis(puedeHablar: boolean, verQueFalta: boolean): ModoAnalisis {
  if (puedeHablar) return "confiable";
  return verQueFalta ? "que-falta" : "datos-de-hoy";
}

/** El parámetro de la URL de «Ver qué falta» (`?ver=falta`): se vuelve a la misma vista al recargar o al compartir el enlace. */
export const PARAM_QUE_FALTA = "ver";
export const VALOR_QUE_FALTA = "falta";

/** Si la URL pide ver qué falta. */
export function leerQueFalta(v: string | string[] | undefined | null): boolean {
  const x = Array.isArray(v) ? v[0] : v;
  return x === VALOR_QUE_FALTA;
}

/** El aviso de arriba en «Todavía no», con el camino de vuelta a los datos de hoy. */
export const AVISO_QUE_FALTA = "Esto es lo que falta para que estas cifras no fallen.";

/** La meta de ventas con su prenda, de cada 100: la misma vara del motor. */
export const META_CON_PRENDA = Math.round(UMBRAL_IDENTIFICADA * 100);

/** Las ventas de los últimos 30 días de una tienda (hoy incluido): cuántas, cuántas con su prenda y cuántas sin ella. */
export function ventas30(p: PreparacionAnalisis | undefined): { unidades: number; identificadas: number; sinPrenda: number } {
  if (!p) return { unidades: 0, identificadas: 0, sinPrenda: 0 };
  const desde = diaAntes(p.hoy, 29);
  const dias = p.dias.filter((d) => d.dia >= desde);
  const unidades = dias.reduce((s, d) => s + d.unidades, 0);
  const identificadas = dias.reduce((s, d) => s + d.identificadas, 0);
  return { unidades, identificadas, sinPrenda: unidades - identificadas };
}

/**
 * «Veo X de cada 100 ventas con su prenda»: la parte de los últimos 14 días cerrados (la que mide el motor) o, si en esos días no se
 * vendió, la de los últimos 30. null si no hay ventas con qué medirlo.
 */
export function ventasConPrendaDe100(p: PreparacionAnalisis | undefined): number | null {
  if (p?.identificada14 != null) return Math.floor(p.identificada14 * 100);
  const v = ventas30(p);
  return v.unidades > 0 ? Math.round((v.identificadas / v.unidades) * 100) : null;
}

const COLA = "estas cifras pueden fallar.";

/**
 * El aviso fijo, en una línea: lo PRIMERO que le falta a la tienda (en el orden de «Todavía no»: ventas con su prenda, piso, almacén)
 * y que las cifras pueden fallar. El resto de lo que falta está a un toque, en «Ver qué falta».
 */
export function avisoDatosDeHoy(p: PreparacionAnalisis | undefined): string {
  const falta = p?.condiciones.find((c) => !c.cumple)?.clave ?? null;
  if (!p || falta === null) return `No se pudo saber qué le falta a esta tienda: ${COLA}`;
  if (falta === "piso_cuadrado") return `Falta cuadrar el piso: ${COLA}`;
  if (falta === "almacen_contado") return `Falta contar el almacén: ${COLA}`;
  const de100 = ventasConPrendaDe100(p);
  if (de100 === null && p.dias.length === 0) return `Esta tienda todavía no tiene ventas en el ERP: ${COLA}`;
  if (de100 !== null && de100 < META_CON_PRENDA) return `Solo ${de100} de cada 100 ventas tienen su prenda: ${COLA}`;
  // Las ventas ya llevan su prenda, pero todavía no 14 días seguidos (un día malo hace poco, o la tienda empezó hace poco).
  return `Llevas ${Math.min(p.racha.dias, DIAS_SOSTENIDOS)} de ${DIAS_SOSTENIDOS} días cobrando con la prenda: ${COLA}`;
}

/** Qué pantallas ve quien mira, para el botón de lo que falta (cada una con su módulo: Por regularizar y Cuadrar son de Existencias). */
export type AccesoPaso = { regularizar: boolean; cuadrar: boolean; conteo: boolean };

/**
 * El botón de lo PRIMERO que le falta a una tienda para que el motor hable: registrar las ventas sin su prenda (las pendientes), cuadrar el piso o contar el
 * almacén. Una sola regla para Análisis («Todavía no») y Frescura (el aviso de la puerta: Formidable 2026-10-10 (c)), así las dos pantallas
 * nunca mandan a lugares distintos por lo mismo. Null si no falta nada, si no hay qué registrar o si la cuenta no ve esa pantalla.
 */
export function pasoParaHablar(falta: ClaveCondicion | null, pendientes: number | null, acceso: AccesoPaso): { href: string; texto: string } | null {
  // Las ventas que todavía se pueden registrar (pendientes en Por regularizar), no todas las de 30 días sin prenda: las cerradas ya no
  // vuelven (ADR-0357, act. 2026-10-14). Sin poder contarlas, el botón va igual, sin número.
  if (falta === "venta_identificada") {
    if (!acceso.regularizar) return null;
    if (pendientes === null) return { href: "/inventario/por-regularizar", texto: "Registrar las ventas sin prenda" };
    return pendientes > 0 ? { href: "/inventario/por-regularizar", texto: `Registrar ${pendientes} sin prenda` } : null;
  }
  if (falta === "piso_cuadrado") return acceso.cuadrar ? { href: "/inventario/cuadrar", texto: "Cuadrar el piso" } : null;
  if (falta === "almacen_contado") return acceso.conteo ? { href: "/inventario/conteo", texto: "Contar el almacén" } : null;
  return null;
}

/** Lo que falta registrar de mi tienda (ADR-0357, act. 2026-10-14): las ventas sin prenda pendientes y las que ya se cerraron en 30 días. */
export type PorRegistrar = { pendientes: number | null; cerradas30: number | null };

/**
 * La fecha más cercana en que se cumple «ventas con su prenda» si desde hoy todo se cobra con su prenda: hoy más los días que le faltan a
 * la racha (los días cerrados, de ayer hacia atrás, sin un día bajo el 90 %). Null si ya se cumple o no se sabe.
 */
export function fechaQueSeCumple(p: Pick<PreparacionAnalisis, "hoy" | "racha"> | undefined): string | null {
  if (!p) return null;
  const faltan = DIAS_SOSTENIDOS - Math.min(p.racha.dias, DIAS_SOSTENIDOS);
  return faltan > 0 ? diaAntes(p.hoy, -faltan) : null;
}

/**
 * Las dos líneas que acompañan a «Ventas con su prenda» mientras no se cumple: cuántas ya se cerraron sin prenda (esas no vuelven a contar:
 * por eso el botón registra menos de las que faltan) y desde qué día puede cumplirse esta parte. Null la que no corresponde.
 */
export function lineasDeLoQueFalta(p: PreparacionAnalisis | undefined, porRegistrar: PorRegistrar): { cerradas: string | null; fecha: string | null } {
  const cumple = p?.condiciones.find((c) => c.clave === "venta_identificada")?.cumple === true;
  if (!p || cumple) return { cerradas: null, fecha: null };
  const n = porRegistrar.cerradas30 ?? 0;
  const fecha = fechaQueSeCumple(p);
  return {
    cerradas: n > 0 ? `${n} ${n === 1 ? "venta se cerró" : "ventas se cerraron"} sin su prenda en estos 30 días: esas ya no se pueden registrar.` : null,
    // `fechaCorta` ya cierra con el punto del mes («20 oct.»): la frase termina ahí.
    fecha: fecha ? `Si desde hoy todo se cobra con su prenda, esta parte se cumple el ${fechaCorta(fecha)}` : null,
  };
}
