import type { AccionPiso, PisoDeTalla } from "./piso-plan";

/* ====================================================================
   «Hoy»: qué pide cada talla, en UNA sola palabra para toda Existencias (Felipe, 2026-10-03)

   El problema: la misma situación se decía de cinco maneras —el filtro «Acción» («Reponer a piso»), el filtro «Estado»
   («Por colgar»), la tarjeta («N tallas sin stock en piso»), el cajón («Faltan tallas en piso», «Piso al día») y la tabla
   («Reponer a piso», «Mantener»)—, y quien filtraba «Por colgar» veía tarjetas que decían otra cosa. Además «Reponer a piso»
   juntaba tallas que se pueden bajar hoy con tallas cuyo almacén está vacío: la asesora filtraba para trabajar y parte de la
   lista no se podía hacer.

   Ahora cada talla cae en UNO de cuatro casos, y el filtro, la tarjeta, la tabla y el cajón dicen la misma palabra. Cuántas
   debe tener colgadas cada talla lo decide el motor del piso (Felipe, 2026-10-04): 1 por color en las tallas del centro de su
   curva (S, M, L; 28, 30, 32; la talla única), o lo que se vendió de ella ayer u hoy; una talla extrema puede quedar guardada.
     · Por colgar      — no queda ninguna colgada, la talla necesita una (es del centro o se vendió) y en el almacén hay.
     · Por reponer     — ayer u hoy se vendió más de lo que queda colgado, y en el almacén hay para bajar.
     · Sin stock atrás — falta en el piso y el almacén está vacío: se trae de otra sede; si se repite es señal para el Taller
                         (el modelo no se vuelve a pedir: ADR-0329 act. 9).
     · Mantener        — ya cuelga lo que pide, o es una talla extrema que puede quedar guardada.
   La regla no vive aquí: cada talla trae su decisión ya tomada (`planPiso`, la de `lib/piso-plan.ts`, ADR-0328 act. 7) y este
   archivo solo la dice con las cuatro palabras. Así la tabla, el filtro, la tarjeta, el cajón y el Inicio no pueden decidir
   distinto: leen la misma decisión.
   ==================================================================== */

export const TIPOS_HOY = ["por_colgar", "por_reponer", "sin_stock_atras", "mantener"] as const;
export type TipoHoy = (typeof TIPOS_HOY)[number];

/** Lo que se PINTA en una talla o una prenda: los cuatro casos del filtro y, solo para mostrar, «En pausa» — el piso de la sede
 *  no está cuadrado y el motor no manda a bajar nada (ADR-0328, decisión 5). «En pausa» no es una opción del filtro «Hoy»: no es
 *  algo que hacer con esa talla sino con el piso entero (cuadrarlo), y lo dice el aviso de la pantalla. Sin esta palabra la talla
 *  decía «N/D» y la tarjeta «Nada pendiente», un vacío que se leía «al día». */
export const ESTADOS_HOY = [...TIPOS_HOY, "en_pausa"] as const;
export type EstadoHoy = (typeof ESTADOS_HOY)[number];

export const TEXTO_HOY: Record<EstadoHoy, string> = {
  por_colgar: "Por colgar",
  por_reponer: "Por reponer",
  sin_stock_atras: "Sin stock atrás",
  mantener: "Mantener",
  en_pausa: "En pausa",
};

/** Lo que significa cada caso, en palabras del piso (para el `title` de un chip y la leyenda de la tabla). */
export const AYUDA_HOY: Record<EstadoHoy, string> = {
  por_colgar:
    "No queda ninguna colgada y esta talla necesita una (es del centro de su curva —S, M, L; 28, 30, 32— o se vendió ayer u hoy); en el almacén hay: se cuelga hoy",
  por_reponer: "Ayer u hoy se vendió más de lo que queda colgado, y en el almacén hay para bajar",
  sin_stock_atras:
    "Falta en el piso y el almacén está vacío: trasládala de otra sede. Si se repite, es señal para el Taller (el modelo no se vuelve a pedir)",
  mantener:
    "Ya cuelga lo que pide: 1 por color en las tallas del centro (S, M, L; 28, 30, 32) y lo que se vendió. Una talla extrema (XS, XL…) puede quedar guardada",
  en_pausa:
    "El piso de esta sede todavía no se cuadró: hasta cuadrarlo no se sabe si falta colgarla (podría estar colgada y el sistema creerla guardada)",
};

/** Lo que la talla necesita: si la sede separa piso y almacén, y la decisión del motor del piso (`planPiso`). */
export type TallaParaHoy = { pisoDisponible: number | null; almacenDisponible: number | null; planPiso?: Pick<PisoDeTalla, "accion"> | null };

/** La palabra de cada acción del motor. La pausa (piso sin cuadrar) no es un caso del filtro «Hoy»: no se afirma nada de una talla
 *  cuyo piso no se sabe (ADR-0328, decisión 5); se pinta «En pausa» (`estadoHoyDeTalla`) y el aviso dice «cuadra el piso». */
const HOY_DE_ACCION: Record<AccionPiso, TipoHoy | null> = {
  por_colgar: "por_colgar",
  por_reponer: "por_reponer",
  sin_atras: "sin_stock_atras",
  mantener: "mantener",
  pausa_sin_cuadre: null,
};

/** El caso de UNA talla. `null` donde la sede no separa piso y almacén (Taller), donde el motor no pudo decidir (su lectura no
 *  respondió: la tabla dice «N/D», nunca un «Mantener» que no sabe) y en pausa. Una talla cae en un solo caso: es la acción del
 *  motor, que es una sola. */
export function hoyDeTalla(f: TallaParaHoy): TipoHoy | null {
  if (f.pisoDisponible === null || f.almacenDisponible === null) return null;
  const accion = f.planPiso?.accion;
  return accion ? HOY_DE_ACCION[accion] : null;
}

/** Lo que se pinta en la talla: su caso de «Hoy», o «En pausa» si el motor la dejó esperando el cuadre del piso. `null` = no se
 *  sabe (Taller, o el motor no respondió): la tabla dice «N/D». */
export function estadoHoyDeTalla(f: TallaParaHoy): EstadoHoy | null {
  const hoy = hoyDeTalla(f);
  if (hoy) return hoy;
  if (f.pisoDisponible === null || f.almacenDisponible === null) return null;
  return f.planPiso?.accion === "pausa_sin_cuadre" ? "en_pausa" : null;
}

/** Cuántas tallas esperan el cuadre del piso (lo que el aviso de la pantalla y la tarjeta dicen en vez de «Nada pendiente»). */
export function contarEnPausa(filas: readonly TallaParaHoy[]): number {
  return filas.filter((f) => estadoHoyDeTalla(f) === "en_pausa").length;
}

/** El contador del filtro «Por colgar»: cuántas tallas y cuántas unidades se podrían colgar hoy (lo disponible en el almacén de
 *  esas tallas — lo mismo que el modal de Reponer deja bajar). */
export function resumirPorColgar(filas: readonly TallaParaHoy[]): { tallas: number; unidades: number } {
  let tallas = 0;
  let unidades = 0;
  for (const f of filas) {
    if (hoyDeTalla(f) !== "por_colgar") continue;
    tallas += 1;
    unidades += f.almacenDisponible ?? 0;
  }
  return { tallas, unidades };
}

/** El aviso de Existencias con el piso sin cuadrar: qué espera, por qué y qué sí vale. `null` si no hay nada esperando (una sede
 *  sin almacén o con el piso cuadrado no tiene nada que avisar). */
export function avisoPausaDelPiso(sede: string, tallas: number): string | null {
  if (tallas <= 0) return null;
  return `El piso de ${sede} todavía no se cuadró: ${tallas} ${tallas === 1 ? "talla espera" : "tallas esperan"} para colgarse. Hasta cuadrarlo, «Hoy» no manda a bajar nada (podría pedir colgar lo que ya cuelga); «Mantener» y «Sin stock atrás» sí valen.`;
}

/** Lo que dice la tarjeta «Reponer a piso hoy» con el piso sin cuadrar, en vez de «Nada pendiente». */
export function textoTarjetaEnPausa(tallas: number): string {
  return `Cuadra el piso antes de colgar: ${tallas} ${tallas === 1 ? "talla espera" : "tallas esperan"}`;
}

/** «1 talla por colgar», «3 tallas sin stock atrás», «2 tallas en pausa», «Mantener»: lo que dicen la tarjeta y la tabla de una
 *  prenda. */
export function textoHoyDePrenda(tipo: EstadoHoy, tallas: number): string {
  if (tipo === "mantener") return TEXTO_HOY.mantener;
  return `${tallas} ${tallas === 1 ? "talla" : "tallas"} ${TEXTO_HOY[tipo].toLocaleLowerCase("es")}`;
}

/** El tono de cada caso, el mismo en la tarjeta, la tabla y el cajón: rojo lo que el cliente no ve y se arregla hoy, ámbar lo
 *  que pide atención, verde lo que está bien y pizarra (informativo, no semáforo: ADR-0169) lo que espera el cuadre del piso. */
export const TONO_HOY: Record<EstadoHoy, "rojo" | "ambar" | "verde" | "pizarra"> = {
  por_colgar: "rojo",
  por_reponer: "ambar",
  sin_stock_atras: "ambar",
  mantener: "verde",
  en_pausa: "pizarra",
};
