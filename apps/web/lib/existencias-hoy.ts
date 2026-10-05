import type { AccionPiso, PisoDeTalla } from "./piso-plan";

/* ====================================================================
   «Hoy»: qué pide cada talla, en UNA sola palabra para toda Existencias (Felipe, 2026-10-03)

   El problema: la misma situación se decía de cinco maneras —el filtro «Acción» («Reponer a piso»), el filtro «Estado»
   («Por colgar»), la tarjeta («N tallas sin stock en piso»), el cajón («Faltan tallas en piso», «Piso al día») y la tabla
   («Reponer a piso», «Mantener»)—, y quien filtraba «Por colgar» veía tarjetas que decían otra cosa. Además «Reponer a piso»
   juntaba tallas que se pueden bajar hoy con tallas cuyo almacén está vacío: la asesora filtraba para trabajar y parte de la
   lista no se podía hacer.

   Ahora cada talla cae en UNO de tres casos, y el filtro, la tarjeta, la tabla y el cajón dicen la misma palabra. Cuántas
   debe tener colgadas cada talla lo decide el motor del piso (Felipe, 2026-10-04): 1 por color, en las tallas del centro de su
   curva (S, M, L; 28, 30, 32; la talla única) y en la que se vendió ayer u hoy; una talla extrema que no se vendió puede quedar
   guardada. Se repone cuando se acaba lo colgado, no antes.
     · Por colgar      — no queda ninguna colgada de esa talla y color, la talla necesita una (es del centro o se vendió) y en
                         el almacén hay.
     · Sin stock atrás — falta en el piso y el almacén está vacío: se trae de otra sede; si se repite es señal para el Taller
                         (el modelo no se vuelve a pedir: ADR-0329 act. 9).
     · Mantener        — ya cuelga al menos una, o es una talla extrema que puede quedar guardada.
   Hubo un cuarto, «Por reponer» («ayer u hoy se vendió más de lo que queda colgado»). Con 1 por color (ADR-0328, «Actualización
   2026-10-04 (tarde)»: se repone cuando se acaba) quedó igual a «Por colgar» —mismo hecho, misma tarea— y se fundió en ella: dos
   palabras para una sola cosa que hacer era lo que este archivo vino a quitar.
   La regla no vive aquí: cada talla trae su decisión ya tomada (`planPiso`, la de `lib/piso-plan.ts`, ADR-0328 act. 7) y este
   archivo solo la dice con sus palabras. Así la tabla, el filtro, la tarjeta, el cajón y el Inicio no pueden decidir
   distinto: leen la misma decisión.
   ==================================================================== */

export const TIPOS_HOY = ["por_colgar", "sin_stock_atras", "mantener"] as const;
export type TipoHoy = (typeof TIPOS_HOY)[number];

/** Lo que se PINTA en una talla o una prenda: los tres casos del filtro y, solo para mostrar, «En pausa» — el piso de la sede
 *  no está cuadrado y el motor no manda a bajar nada (ADR-0328, decisión 5). «En pausa» no es una opción del filtro «Hoy»: no es
 *  algo que hacer con esa talla sino con el piso entero (cuadrarlo), y lo dice el aviso de la pantalla. Sin esta palabra la talla
 *  decía «N/D» y la tarjeta «Nada pendiente», un vacío que se leía «al día». */
export const ESTADOS_HOY = [...TIPOS_HOY, "en_pausa"] as const;
export type EstadoHoy = (typeof ESTADOS_HOY)[number];

export const TEXTO_HOY: Record<EstadoHoy, string> = {
  por_colgar: "Por colgar",
  sin_stock_atras: "Sin stock atrás",
  mantener: "Mantener",
  en_pausa: "En pausa",
};

/** Lo que significa cada caso, en palabras del piso (para el `title` de un chip y la leyenda de la tabla). */
export const AYUDA_HOY: Record<EstadoHoy, string> = {
  por_colgar:
    "No queda ninguna colgada de esta talla y color, y hace falta una (basta 1 por color): es del centro de su curva —S, M, L; 28, 30, 32— o se vendió ayer u hoy. En el almacén hay: se cuelga hoy",
  sin_stock_atras:
    "Falta en el piso y el almacén está vacío: trasládala de otra sede. Si se repite, es señal para el Taller (el modelo no se vuelve a pedir)",
  mantener:
    "Ya cuelga al menos una de esta talla y color (basta 1 por color). Una talla extrema (XS, XL…) que no se vendió ayer ni hoy puede quedar guardada",
  en_pausa:
    "El piso de esta sede todavía no se cuadró: hasta cuadrarlo no se sabe si falta colgarla (podría estar colgada y el sistema creerla guardada)",
};

/** Lo que la talla necesita: si la sede separa piso y almacén, y la decisión del motor del piso (`planPiso`). */
export type TallaParaHoy = { pisoDisponible: number | null; almacenDisponible: number | null; planPiso?: Pick<PisoDeTalla, "accion"> | null };

/** La palabra de cada acción del motor. La pausa (piso sin cuadrar) no es un caso del filtro «Hoy»: no se afirma nada de una talla
 *  cuyo piso no se sabe (ADR-0328, decisión 5); se pinta «En pausa» (`estadoHoyDeTalla`) y el aviso dice «cuadra el piso». */
const HOY_DE_ACCION: Record<AccionPiso, TipoHoy | null> = {
  por_colgar: "por_colgar",
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

/** Cuántas tallas esperan el cuadre del piso (lo que el aviso de la tabla y «Para hoy» dicen en vez de «Todo al día»). */
export function contarEnPausa(filas: readonly TallaParaHoy[]): number {
  return filas.filter((f) => estadoHoyDeTalla(f) === "en_pausa").length;
}

// El contador del filtro «Por colgar» (cuántas tallas y cuántas unidades) no vive aquí: es `porColgarDeLaSede`
// (`existencias-para-hoy.ts`), la MISMA cuenta que leen «Para hoy» y el Inicio de Almacén (ADR-0331 act. b). Este archivo
// solo dice la decisión del motor con sus palabras; contar en dos lugares es lo que separó los números hasta el 2026-10-04.

/** El aviso de Existencias con el piso sin cuadrar: qué espera, por qué y qué sí vale. `null` si no hay nada esperando (una sede
 *  sin almacén o con el piso cuadrado no tiene nada que avisar). */
export function avisoPausaDelPiso(sede: string, tallas: number): string | null {
  if (tallas <= 0) return null;
  return `El piso de ${sede} todavía no se cuadró: ${tallas} ${tallas === 1 ? "talla espera" : "tallas esperan"} para colgarse. Hasta cuadrarlo, «Hoy» no manda a bajar nada (podría pedir colgar lo que ya cuelga); «Mantener» y «Sin stock atrás» sí valen.`;
}

/** «1 talla por colgar», «3 tallas sin stock atrás», «2 tallas en pausa», «Mantener»: lo que dicen la tarjeta y la tabla de una
 *  prenda. */
export function textoHoyDePrenda(tipo: EstadoHoy, tallas: number): string {
  if (tipo === "mantener") return TEXTO_HOY.mantener;
  return `${tallas} ${tallas === 1 ? "talla" : "tallas"} ${TEXTO_HOY[tipo].toLocaleLowerCase("es")}`;
}

/** El tono de cada caso, el mismo en la tarjeta, la tabla y el cajón: ámbar lo que se hace aquí hoy (colgar), pizarra lo
 *  que se resuelve afuera (pedirlo a otra sede o al Taller) o espera el cuadre del piso (informativo, no semáforo: ADR-0169), verde
 *  lo que está bien. Ningún caso es rojo (rediseño 2026-10-04): «por colgar» es trabajo, no un error, y en rojo salía en casi todas
 *  las tarjetas de una tienda, con más de 30 rojos por pantalla contra un tope de 2 (`MAX_ROJO_POR_PANTALLA`). El rojo queda para lo
 *  que de verdad falló (una dañada, un plazo vencido). */
export const TONO_HOY: Record<EstadoHoy, "ambar" | "verde" | "pizarra"> = {
  por_colgar: "ambar",
  sin_stock_atras: "pizarra",
  mantener: "verde",
  en_pausa: "pizarra",
};
