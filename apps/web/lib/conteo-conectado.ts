/**
 * Conteo conectado (spike `docs/maquetas/conteo-conectado-2026-09/`, Felipe 2026-09-26; rediseño 2026-09-29): lo que
 * usa la cámara en ráfaga y el aviso de cada lectura. Sin red y sin React, para poder probarlo.
 *
 * Lo que decide cada pieza, en palabras de la tienda:
 *  · Con la cámara, una pila de 12 blusas iguales tiene 12 veces el MISMO código: `debeContarLectura` cuenta el mismo
 *    código otra vez solo si la etiqueta salió del cuadro entre una lectura y la otra (la misma etiqueta quieta no suma sola).
 *  · Cada lectura suena y vibra distinto según qué pasó: `sonidoDeLectura`.
 *
 * El resto de lo que vivía acá (agrupar «faltan» por percha, recontar a ciegas, «no encontradas» con su decisión, los
 * accesos «Bajar al piso» y «Imprimir etiquetas» tras cerrar, las marcas en el aparato) se fue con el rediseño: ahora
 * cada variante tiene su «Debe haber» y su estado en la propia lista (`conteo-reglas.ts`), sin listas aparte.
 */

// --- Cámara en ráfaga -----------------------------------------------------------------------------------------------

/** Lo mínimo entre dos lecturas del MISMO código, aunque la etiqueta haya salido del cuadro: el lector a ~8 cuadros por
 *  segundo puede perderla un cuadro y volver a verla sin que nadie la haya movido. */
export const HUECO_MINIMO_MS = 350;

/**
 * ¿Esta lectura suma? Un código distinto al anterior, siempre. El mismo código, solo si entre las dos hubo un cuadro sin
 * código (la etiqueta salió del visor: se pasó a la prenda siguiente de la pila) y pasó `HUECO_MINIMO_MS`. La misma
 * etiqueta quieta frente a la cámara nunca suma sola — el error que más caro sale en un conteo.
 */
export function debeContarLectura(
  codigo: string,
  ultima: { codigo: string; en: number } | null,
  { huboHueco, ahora }: { huboHueco: boolean; ahora: number }
): boolean {
  if (!codigo) return false;
  if (!ultima || ultima.codigo !== codigo) return true;
  return huboHueco && ahora - ultima.en >= HUECO_MINIMO_MS;
}

// --- Sonido y vibración ---------------------------------------------------------------------------------------------

/** `suma`: otra unidad de una variante ya verificada · `nueva`: la primera unidad de una variante que estaba pendiente ·
 *  `desconocida`: el código no es de ninguna prenda del catálogo. Con la pistola se mira el rack, no la pantalla: el
 *  oído dice qué pasó. */
export type SonidoLectura = "suma" | "nueva" | "desconocida";

export function sonidoDeLectura(r: { encontrada: boolean; yaContada: boolean }): SonidoLectura {
  if (!r.encontrada) return "desconocida";
  return r.yaContada ? "suma" : "nueva";
}

/** Cada sonido: tonos (hercios, milisegundos) separados por 60 ms, y su vibración. Corto y agudo = todo bien; grave y
 *  largo = mira la pantalla. */
export const PATRON_SONIDO: Record<SonidoLectura, { tonos: readonly (readonly [number, number])[]; vibracion: number | number[] }> = {
  suma: { tonos: [[1760, 70]], vibracion: 35 },
  nueva: { tonos: [[1320, 60], [1760, 70]], vibracion: [30, 50, 30] },
  desconocida: { tonos: [[330, 260]], vibracion: [120, 60, 120] },
};
