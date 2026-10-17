// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A6): elegir la meta de «Qué pedir» entre las campañas del
// Plan de campaña. Lógica pura que SOLO usa el servidor (`analisis-datos.ts`): trae el Plan (`plan-compra-momento.ts`, `plan-compra-reglas.ts`), que
// es grande, y la pantalla recibe ya el resultado (`DatosAnalisis.horizonte`), no el Plan. Lo que dibuja la pantalla con ese resultado vive en
// `analisis-horizonte.ts`.
//
// QUÉ CAMPAÑAS CUENTAN. Solo las que tienen su PLAN (`planes_compra`, sin archivar): son las que alguien armó en Compras ▸ Plan de campaña. El
// calendario de Etiquetas (Día del Gato del 24 al 30 oct., Halloween desde el 15 set.) también trae «campañas», pero no son campañas de COMPRA: con
// ellas la próxima del 16-oct sería una semana de octubre y la meta estaría a 14 días. `proximaCampana` se usa tal cual (sus firmas no cambian) con el
// calendario vacío, para que solo mire los planes.
//
// QUÉ MIDE «FIN DE LA CAMPAÑA». La próxima que todavía no empieza; y, si otra campaña del Plan se cruza con ella (Diciembre del 1 al 31 contiene
// a Navidad del 11 al 25), el fin de la que termina más tarde: el 5-dic la próxima es Navidad, pero la meta no puede achicarse al 25-dic justo cuando
// el 26 al 31 (Año Nuevo, hasta ~4,8 veces un día de octubre) es lo que más vende. Es una decisión de este archivo, escrita en ADR-0357.

import { proximaCampana } from "./plan-compra-momento";
import type { CampanasLeidas } from "./plan-compra-reglas";
import { diasEntreFechas, sumarDias } from "./fechas-lima";
import { CAMPANA_MAX_DIAS, horizonteDeCampana, horizonteDeRespaldo, type CampanaDelRitmo, type Horizonte } from "./analisis-horizonte";

/** Lo que se pudo saber del Plan de campaña: leído, o por qué no. */
export type LecturaCampanas =
  | { estado: "ok"; campanas: Pick<CampanasLeidas, "planes" | "etiquetas"> }
  /** Quien mira no ve el módulo «Plan de campaña» (la base no le deja leer las campañas): no es un error. */
  | { estado: "sin_modulo" }
  /** El Plan no respondió: la pantalla lo dice y mide hasta el respaldo. */
  | { estado: "fallo" };

/** Las campañas que cuentan: con plan y sin archivar. */
const conPlan = (c: Pick<CampanasLeidas, "planes">) => c.planes.filter((p) => !p.archivado);

/**
 * La meta de hoy (D3): el fin de la próxima campaña del Plan si EMPIEZA en 120 días o menos; si la próxima está más lejos, el plazo de pedido más un
 * mes; y sin campañas por venir o sin el módulo, el respaldo (25-dic mientras falte, y después plazo + 30). Siempre trae su `nota` cuando no es
 * una campaña, para que la pantalla diga de dónde sale.
 */
export function horizonteDeCompra(hoy: string, lectura: LecturaCampanas): Horizonte {
  if (lectura.estado !== "ok") return horizonteDeRespaldo(hoy, lectura.estado);
  const vivas = conPlan(lectura.campanas);
  const proxima = proximaCampana({ planes: vivas, etiquetas: [] }, hoy, "");
  if (!proxima) return horizonteDeRespaldo(hoy, "sin_campanas");
  if (proxima.dias > CAMPANA_MAX_DIAS) return horizonteDeRespaldo(hoy, { lejos: { nombre: proxima.nombre, dias: proxima.dias } });
  const destino = proxima.destino;
  const plan = destino.tipo === "plan" ? vivas.find((p) => p.id === destino.id) : undefined;
  if (!plan) return horizonteDeRespaldo(hoy, "sin_campanas");
  // La que termina más tarde entre la próxima y las que se cruzan con ella (a igual fin, la próxima).
  const fin = vivas.reduce((mejor, p) => (p.desde <= plan.hasta && p.hasta >= plan.desde && p.hasta > mejor.hasta ? p : mejor), plan);
  return horizonteDeCampana(hoy, { nombre: fin.nombre, hasta: fin.hasta });
}

/** Desde qué parte de la ventana se habla de «la campaña del ritmo»: la mitad o más. */
export const PARTE_DE_LA_VENTANA_EN_CAMPANA = 0.5;

/**
 * La campaña del Plan en la que cae casi toda la ventana del ritmo (los `ventana` días que terminan hoy), o null. Si dos se cruzan, la que más días
 * de la ventana cubre. Con una ventana de 1 día no se habla de ritmo. Una campaña sin plan o archivada no cuenta.
 */
export function campanaDelRitmo(hoy: string, ventana: number, lectura: LecturaCampanas): CampanaDelRitmo | null {
  if (lectura.estado !== "ok" || !(ventana >= 2)) return null;
  const desde = sumarDias(hoy, -(ventana - 1));
  let mejor: CampanaDelRitmo | null = null;
  for (const p of conPlan(lectura.campanas)) {
    const ini = p.desde > desde ? p.desde : desde;
    const fin = p.hasta < hoy ? p.hasta : hoy;
    const dias = fin >= ini ? diasEntreFechas(ini, fin) + 1 : 0;
    if (dias > 0 && (mejor === null || dias > mejor.dias)) mejor = { nombre: p.nombre, desde: p.desde, hasta: p.hasta, dias, de: ventana };
  }
  return mejor !== null && mejor.dias >= ventana * PARTE_DE_LA_VENTANA_EN_CAMPANA ? mejor : null;
}
