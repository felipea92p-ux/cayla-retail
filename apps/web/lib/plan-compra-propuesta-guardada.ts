// La propuesta del sistema que se guarda junto al plan (ADR-0520, tarea #1 de la auditoría del Plan de campaña).
//
// EL PROBLEMA. Cada guardado de una categoría pisa al anterior y lo que el sistema propuso en ese momento no quedaba en ningún lado. La propuesta
// depende de las ventas de los últimos días: después no se puede reconstruir. La base ya guarda una fila de historial por guardado
// (`planes_compra_lineas_historial`) y acepta la propuesta en `p_propuesta`; esto arma lo que se manda.
//
// CONTRATO
//   PROMETE: devolver lo que la pantalla MOSTRÓ al guardar, nunca algo recalculado; un objeto de menos de `MAX_PROPUESTA` caracteres (si las tiendas lo
//            pasan, se manda sin el detalle por tienda en vez de rechazar el guardado); y repetir el guardado SIN la propuesta si la base todavía no
//            conoce el parámetro. El plan nunca se pierde por esto.
//   NO HACE: no calcula la propuesta (eso es `proponer`, `lib/plan-compra-propuesta.ts`), no valida el plan (eso es `problemasDelBorrador`) ni decide
//            si la persona hizo caso a la propuesta: esa comparación sale después, de la base.

import type { PropuestaCategoria } from "./plan-compra-propuesta";

/** El formato de lo que se manda: sube si cambia, para poder leer un historial con formatos mezclados. */
const VERSION_PROPUESTA = 1;

/**
 * El largo máximo del JSON que la base acepta (`planes_compra_lineas_historial.propuesta` y `guardar_plan_compra_linea`, migración 20261026171000).
 * @internal La prueba lo cruza con el 8192 de la migración: si una cambia sin la otra, falla.
 */
export const MAX_PROPUESTA = 8192;

export type PropuestaGuardada = {
  v: number;
  /** Cuándo leyó la pantalla los datos de los que salió (una pestaña abierta desde ayer dice «ayer»); null si no se sabe. */
  calculada_en: string | null;
  /** El sistema no tenía de dónde proponer (la categoría no vendió en 90 días): la persona armó el plan sola. */
  sin_ventas?: true;
  dias_campana?: number;
  flojo?: number | null;
  normal?: number;
  bueno?: number;
  historial_leido?: boolean;
  /** Cómo salió cada tienda; se omite si el conjunto no cabe. */
  tiendas?: { tienda: string; normal: number; flojo: number | null; bueno: number; como: string; multiplicador: number | null; previa: number }[];
};

/**
 * Lo que se manda a la base como propuesta. `undefined` (la base no manda propuestas: no hay nada que decir) da null; `null` (la categoría no vendió
 * en 90 días) deja anotado que el sistema no tenía nada que proponer, que también es un dato.
 */
export function propuestaParaGuardar(propuesta: PropuestaCategoria | null | undefined, leidaEn: string | null | undefined): PropuestaGuardada | null {
  if (propuesta === undefined) return null;
  const calculada_en = leidaEn ?? null;
  if (propuesta === null) return { v: VERSION_PROPUESTA, calculada_en, sin_ventas: true };
  const resumen: PropuestaGuardada = {
    v: VERSION_PROPUESTA,
    calculada_en,
    dias_campana: propuesta.diasCampana,
    flojo: propuesta.flojo,
    normal: propuesta.normal,
    bueno: propuesta.bueno,
    historial_leido: propuesta.historialLeido,
  };
  const completa: PropuestaGuardada = {
    ...resumen,
    tiendas: propuesta.tiendas.map((t) => ({ tienda: t.tienda, normal: t.normal, flojo: t.flojo, bueno: t.bueno, como: t.como, multiplicador: t.multiplicador, previa: t.previa })),
  };
  return JSON.stringify(completa).length <= MAX_PROPUESTA ? completa : resumen;
}

type ErrorDeLaBase = { code?: string; message: string };

/** ¿La base no conoce esa firma de la función? Pasa cuando la web se publica ANTES de pegar la migración (PostgREST: PGRST202; Postgres: 42883). */
export function esFirmaDesconocida(error: ErrorDeLaBase | null | undefined): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function|function .* does not exist/i.test(error.message));
}

/**
 * Guarda con la propuesta; si la base responde que no conoce el parámetro, repite el MISMO guardado sin ella. Nada más se reintenta: un conflicto
 * de versión, un permiso o un corte de red salen tal cual. `llamar` recibe los argumentos y devuelve la respuesta de la base.
 */
export async function guardarConPropuesta<R extends { error: ErrorDeLaBase | null }>(
  llamar: (args: Record<string, unknown>) => PromiseLike<R>,
  args: Record<string, unknown>,
): Promise<R> {
  const primera = await llamar(args);
  if (!("p_propuesta" in args) || !esFirmaDesconocida(primera.error)) return primera;
  return llamar(Object.fromEntries(Object.entries(args).filter(([nombre]) => nombre !== "p_propuesta")));
}
