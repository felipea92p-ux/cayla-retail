import type { AccionPiso, PisoDeTalla } from "./piso-plan";

/* ====================================================================
   «Hoy»: qué pide cada talla, en UNA sola palabra para toda Existencias (Felipe, 2026-10-03)

   El problema: la misma situación se decía de cinco maneras —el filtro «Acción» («Reponer a piso»), el filtro «Estado»
   («Por colgar»), la tarjeta («N tallas sin stock en piso»), el cajón («Faltan tallas en piso», «Piso al día») y la tabla
   («Reponer a piso», «Mantener»)—, y quien filtraba «Por colgar» veía tarjetas que decían otra cosa. Además «Reponer a piso»
   juntaba tallas que se pueden bajar hoy con tallas cuyo almacén está vacío: la asesora filtraba para trabajar y parte de la
   lista no se podía hacer.

   Ahora cada talla cae en UNO de cuatro casos, y el filtro, la tarjeta, la tabla y el cajón dicen la misma palabra:
     · Por colgar      — en el piso no queda ni una para vender y en el almacén sí: la clienta no la ve, se cuelga hoy.
     · Por reponer     — queda poco en el piso (la regla física de piso pide reponer) y hay en el almacén para bajar.
     · Sin stock atrás — la regla pide reponer pero el almacén está vacío: no se resuelve en la tienda (pedir o trasladar).
     · Mantener        — nada que hacer hoy con el piso.
   La regla no vive aquí: cada talla trae su decisión ya tomada (`planPiso`, la de `lib/piso-plan.ts`, ADR-0328 act. 7) y este
   archivo solo la dice con las cuatro palabras. Así la tabla, el filtro, la tarjeta, el cajón y el Inicio no pueden decidir
   distinto: leen la misma decisión.
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
  por_reponer: "Queda poco en el piso y hay en el almacén para bajar",
  sin_stock_atras: "Falta en el piso y el almacén está vacío: hay que pedirla o trasladarla",
  mantener: "Nada que hacer hoy con el piso de esta talla",
};

/** Lo que la talla necesita: si la sede separa piso y almacén, y la decisión del motor del piso (`planPiso`). */
export type TallaParaHoy = { pisoDisponible: number | null; almacenDisponible: number | null; planPiso?: Pick<PisoDeTalla, "accion"> | null };

/** La palabra de cada acción del motor. La pausa (piso sin cuadrar) no tiene palabra en «Hoy»: no se afirma nada de una talla
 *  cuyo piso no se sabe (ADR-0328, decisión 5); lo dice la portada con «Cuadra el piso». */
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

/** «1 talla por colgar», «3 tallas sin stock atrás», «Mantener»: lo que dicen la tarjeta y la tabla de una prenda. */
export function textoHoyDePrenda(tipo: TipoHoy, tallas: number): string {
  if (tipo === "mantener") return TEXTO_HOY.mantener;
  return `${tallas} ${tallas === 1 ? "talla" : "tallas"} ${TEXTO_HOY[tipo].toLocaleLowerCase("es")}`;
}

/** El tono de cada caso, el mismo en la tarjeta, la tabla y el cajón: rojo lo que la clienta no ve y se arregla hoy, ámbar lo
 *  que pide atención, verde lo que está bien. */
export const TONO_HOY: Record<TipoHoy, "rojo" | "ambar" | "verde"> = {
  por_colgar: "rojo",
  por_reponer: "ambar",
  sin_stock_atras: "ambar",
  mantener: "verde",
};
