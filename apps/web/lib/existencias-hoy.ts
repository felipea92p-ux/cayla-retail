import { porColgar } from "./inventario-reglas";
import type { TipoAccionHoy } from "./existencias-recomendaciones";

/* ====================================================================
   «Hoy»: qué pide cada talla, en UNA sola palabra para toda Existencias (Felipe, 2026-10-03)

   El problema: la misma situación se decía de cinco maneras —el filtro «Acción» («Colgar en el piso»), el filtro «Estado»
   («Por colgar»), la tarjeta («N tallas sin stock en piso»), el cajón («Faltan tallas en piso», «Piso al día») y la tabla
   («Colgar en el piso», «Mantener»)—, y quien filtraba «Por colgar» veía tarjetas que decían otra cosa. Además «Colgar en el piso»
   juntaba tallas que se pueden bajar hoy con tallas cuyo almacén está vacío: la asesora filtraba para trabajar y parte de la
   lista no se podía hacer.

   Ahora cada talla cae en UNO de cuatro casos, y el filtro, la tarjeta, la tabla y el cajón dicen la misma palabra:
     · Por colgar      — en el piso no queda ni una para vender y en el almacén sí: la clienta no la ve, se cuelga hoy.
     · Por reponer     — queda poco en el piso (la regla física de piso pide reponer) y hay en el almacén para bajar.
     · Sin stock atrás — la regla pide reponer pero el almacén está vacío: no se resuelve en la tienda (pedir o trasladar).
     · Mantener        — nada que hacer hoy con el piso.
   No cambia el motor de «Acción hoy» (`calcularAccionHoy`, regla del 2026-09-25): solo separa SU «Colgar en el piso» según haya o
   no algo libre atrás, con las mismas cifras que ya decide «Colgar en el piso» (`sePuedeBajar`).
   ==================================================================== */

export const TIPOS_HOY = ["por_colgar", "por_reponer", "sin_stock_atras", "mantener"] as const;
export type TipoHoy = (typeof TIPOS_HOY)[number];

export const TEXTO_HOY: Record<TipoHoy, string> = {
  por_colgar: "Por colgar",
  por_reponer: "Por reponer",
  sin_stock_atras: "Sin stock atrás",
  mantener: "Mantener",
};

/** Lo que significa cada caso, en palabras del piso (para el `title` de un chip y la leyenda de la tabla). */
export const AYUDA_HOY: Record<TipoHoy, string> = {
  por_colgar: "En el piso no queda ninguna para vender y en el almacén sí: se cuelga hoy",
  por_reponer: "Queda poco en el piso y hay en el almacén para colgar",
  sin_stock_atras: "Falta en el piso y el almacén está vacío: hay que pedirla o trasladarla",
  mantener: "Nada que hacer hoy con el piso de esta talla",
};

/** Lo que la talla necesita para decidir: lo libre en piso y almacén (neto de apartados) y la «Acción hoy» del motor. */
export type TallaParaHoy = { pisoDisponible: number | null; almacenDisponible: number | null; accionHoy?: { tipo: TipoAccionHoy } | null };

/** El caso de UNA talla. `null` donde la sede no separa piso y almacén (Taller): ahí no hay «Hoy». El orden de las preguntas
 *  hace que los cuatro casos no se pisen: una talla cae siempre en uno solo. */
export function hoyDeTalla(f: TallaParaHoy): TipoHoy | null {
  if (f.pisoDisponible === null || f.almacenDisponible === null) return null;
  if (porColgar(f)) return "por_colgar";
  if (f.accionHoy?.tipo === "bajar_al_piso") return f.almacenDisponible > 0 ? "por_reponer" : "sin_stock_atras";
  return "mantener";
}

/** «1 talla por colgar», «3 tallas sin stock atrás», «Mantener»: lo que dicen la tarjeta y la tabla de una prenda. */
export function textoHoyDePrenda(tipo: TipoHoy, tallas: number): string {
  if (tipo === "mantener") return TEXTO_HOY.mantener;
  return `${tallas} ${tallas === 1 ? "talla" : "tallas"} ${TEXTO_HOY[tipo].toLocaleLowerCase("es")}`;
}

/** El tono de cada caso, el mismo en la tarjeta, la tabla y el cajón: ámbar lo que se hace aquí hoy (colgar, reponer), pizarra lo
 *  que se resuelve afuera (pedirlo a otra sede o al Taller), verde lo que está bien. Ningún caso es rojo (rediseño 2026-10-04):
 *  «por colgar» es trabajo, no un error, y en rojo salía en casi todas las tarjetas de una tienda, con más de 30 rojos por pantalla
 *  contra un tope de 2 (`MAX_ROJO_POR_PANTALLA`). El rojo queda para lo que de verdad falló (una dañada, un plazo vencido). */
export const TONO_HOY: Record<TipoHoy, "ambar" | "verde" | "pizarra"> = {
  por_colgar: "ambar",
  por_reponer: "ambar",
  sin_stock_atras: "pizarra",
  mantener: "verde",
};
