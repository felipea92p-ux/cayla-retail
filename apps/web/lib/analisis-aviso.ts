// Análisis v4 (ADR-0357, decisión 2, act. 2026-10-06): lo que Análisis dice mientras la tienda todavía no cumple las tres condiciones
// del motor (ADR-0346). Felipe lo pidió al ver producción: ninguna tienda cumple y la pantalla solo decía «Todavía no». «Todavía no»
// sigue siendo lo primero; «Ver con los datos de hoy» es un botón explícito y, mientras se mira, un aviso fijo dice qué falta y que las
// cifras pueden fallar. La cifra de «Todavía no» y la del aviso salen de aquí, para que nunca digan cosas distintas.

import type { PreparacionAnalisis } from "./analisis-tipos";
import { DIAS_SOSTENIDOS, diaAntes, UMBRAL_IDENTIFICADA } from "./motor-demanda-reglas";

/** El parámetro de la URL que lo deja encendido (`?datos=hoy`): se puede volver a la misma vista al recargar o compartir el enlace. */
export const PARAM_DATOS_DE_HOY = "datos";
export const VALOR_DATOS_DE_HOY = "hoy";

/** Si la URL pide ver con los datos de hoy. */
export function leerDatosDeHoy(v: string | string[] | undefined | null): boolean {
  const x = Array.isArray(v) ? v[0] : v;
  return x === VALOR_DATOS_DE_HOY;
}

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
