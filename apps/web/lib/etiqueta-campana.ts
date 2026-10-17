// Lo que un Líder escribe al configurar una campaña (descuento, fechas) y las
// reglas para aceptarlo. Las mismas reglas las cierra la base
// (`etiquetas_descuento_rango`, `etiquetas_vigencia_coherente`, y el RPC
// `actualizar_campana_etiqueta`); esto solo las dice con una frase clara ANTES
// de ir a la base, y sirve igual en el navegador y en la API.

import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";
import type { Vigencia } from "./etiqueta-vigencia";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/**
 * "20", "12.5", "12,5", "20 %" → número. Vacío → `null` (etiqueta informativa,
 * sin descuento). El rango es (0, 100], igual que `codigos_descuento`.
 */
export function parsearDescuento(texto: string): Resultado<number | null> {
  const limpio = texto.replace("%", "").trim().replace(",", ".");
  if (limpio === "") return { ok: true, valor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return { ok: false, error: "Escribe el descuento como un número, por ejemplo 20 o 12.5." };
  const n = Number(limpio);
  if (n <= 0 || n > 100) return { ok: false, error: "El descuento tiene que ser mayor que 0 y como máximo 100 %." };
  return { ok: true, valor: n };
}

/** Fecha `AAAA-MM-DD` real (rechaza el 2026-02-31) o vacío → `null`. */
export function parsearFecha(texto: string): Resultado<string | null> {
  const limpio = texto.trim();
  if (limpio === "") return { ok: true, valor: null };
  const invalida = { ok: false, error: "Esa fecha no es válida." } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return invalida;
  // Un mes 13 da `Invalid Date` (y `toISOString` lanza); un 31 de febrero se
  // "corre" al 3 de marzo — por eso se compara de vuelta con lo escrito.
  const fecha = new Date(`${limpio}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== limpio) return invalida;
  return { ok: true, valor: limpio };
}

export function objecionVigencia(desde: string | null, hasta: string | null): string | null {
  if (desde && hasta && desde > hasta) return "La fecha de inicio no puede ser posterior a la de fin.";
  return null;
}

// ---- Aviso «por debajo del costo» --------------------------------------------------
// La campaña NO se bloquea aunque baje del costo (una liquidación puede ser justo eso;
// decidido con Felipe, 2026-09-18). Pero quien la configura tiene que ENTERARSE: un 60 %
// escrito por error se cobra tal cual en el mostrador. El costo es un dato del Líder, así
// que el aviso vive acá y no en la caja.

/** `precio` es el MÁS BAJO al que se cobra la prenda en cualquier tienda (la campaña vale en todas: el peor caso es el que importa):
 *  el de la prenda o el propio de una tienda (`precioMasBajoEnTiendas`, Felipe 2026-10-10). `enSede` dice cuál tienda lo fija
 *  («Trujillo»), o `null` si es el de la prenda: el aviso nombra la tienda para que quien configura sepa dónde está el precio. */
export type PrendaConCosto = { id: string; categoriaId: string | null; precio: number; costo: number; nombre: string; enSede?: string | null };

/** Cómo se nombra una prenda en el aviso: «Falda Emma (FAL-0008-NEG-M) · precio más bajo: S/ 69.90 en Trujillo» si el precio más bajo
 *  al que se cobra es el propio de una tienda; el nombre tal cual si es el de la prenda. Dice un HECHO (el precio más bajo y dónde), no
 *  una causa: si la prenda a su precio —o otra tienda— también queda bajo el costo, el texto no insinúa que arreglar esa tienda basta.
 *  (Un separador, no un paréntesis: el nombre ya lleva uno.) */
export function nombreBajoCosto(p: Pick<PrendaConCosto, "nombre" | "enSede" | "precio">): string {
  return p.enSede ? `${p.nombre} · precio más bajo: S/\u00a0${p.precio.toFixed(2)} en ${p.enSede}` : p.nombre;
}

// ---- Cuánto alcanza una campaña, dicho ANTES de guardar --------------------------------
// La regla es la de la base (`fn_campanas_por_variante`): una prenda entra si está marcada a mano o si su categoría está
// elegida. Aquí solo se cuenta, con las prendas a la venta (variantes activas) que ya trae la página: sin ir a la base.

/** Los descuentos de siempre, a un toque en la hoja de campaña. El campo sigue para cualquier otro. */
export const DESCUENTOS_RAPIDOS = [10, 15, 20, 25, 30, 50] as const;

/** Cuántas prendas a la venta trae cada categoría: lo que dice cada chip de la hoja de campaña. */
export function prendasPorCategoria(prendas: readonly Pick<PrendaConCosto, "categoriaId">[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const p of prendas) if (p.categoriaId !== null) cuenta.set(p.categoriaId, (cuenta.get(p.categoriaId) ?? 0) + 1);
  return cuenta;
}

export type AlcanceCampana = { porCategoria: number; aMano: number; total: number };

/** A cuántas prendas a la venta llega una campaña: las de sus categorías, más las marcadas a mano que no entran ya por su
 *  categoría. Una marcada a mano que ya no está a la venta (una talla desactivada) no cuenta: en caja no se puede cobrar. */
export function alcanceCampana(
  prendas: readonly Pick<PrendaConCosto, "id" | "categoriaId">[],
  categoriaIds: ReadonlySet<string>,
  varianteIdsManuales: ReadonlySet<string>,
): AlcanceCampana {
  let porCategoria = 0;
  let aMano = 0;
  for (const p of prendas) {
    if (p.categoriaId !== null && categoriaIds.has(p.categoriaId)) porCategoria++;
    else if (varianteIdsManuales.has(p.id)) aMano++;
  }
  return { porCategoria, aMano, total: porCategoria + aMano };
}

// ---- Lo que dice la tarjeta de una etiqueta -------------------------------------------------------------------------------
// La tarjeta cuenta con la MISMA regla que la hoja «Prendas» y la de campaña: una prenda a la venta es una talla activa de un
// producto que no está descontinuado (`prendas`, la lista que trae la página). Antes contaba las filas de `variante_etiquetas`
// tal cual: «Nuevo» decía 186 y su hoja mostraba 164, porque 22 marcas eran de tallas desactivadas (producción, 2026-10-17).

export type ConteoTarjeta = AlcanceCampana & {
  /** Marcadas a mano que ya no se venden (una talla desactivada, un producto descontinuado): no cuentan, pero se dicen. */
  fueraDeVenta: number;
};

export function conteoDeTarjeta(
  prendas: readonly Pick<PrendaConCosto, "id" | "categoriaId">[],
  categoriaIds: ReadonlySet<string>,
  manuales: readonly string[],
): ConteoTarjeta {
  const enVenta = new Set(prendas.map((p) => p.id));
  return { ...alcanceCampana(prendas, categoriaIds, new Set(manuales)), fueraDeVenta: manuales.filter((id) => !enVenta.has(id)).length };
}

const prendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;

/** «164 prendas a la venta», «230 prendas a la venta · 200 por categoría» o «Sin prendas a la venta»; y, aparte, «22 marcadas
 *  que ya no se venden» si las hay (la razón de un número que bajó, o de un cero). */
export function textoConteoTarjeta(c: ConteoTarjeta): { texto: string; fuera: string | null } {
  const texto =
    c.total === 0 ? "Sin prendas a la venta" : c.porCategoria === 0 ? `${prendas(c.total)} a la venta` : `${prendas(c.total)} a la venta · ${c.porCategoria} por categoría`;
  const fuera = c.fueraDeVenta === 0 ? null : c.fueraDeVenta === 1 ? "1 marcada que ya no se vende" : `${c.fueraDeVenta} marcadas que ya no se venden`;
  return { texto, fuera };
}

export type ChipTarjeta = { texto: string; tono: "verde" | "ambar" | "neutro"; title?: string };

/** El chip de la temporada. Una campaña vigente que no llega a ninguna prenda a la venta va en ámbar: en verde parecía que
 *  bajaba precios y no tocaba ninguno («Para liquidar», vigente del 1 set. al 31 dic. con 0 prendas, producción 2026-10-17).
 *  `alcance` es `null` cuando quien mira no ve los conteos: ahí dice solo «Vigente», como antes. */
export function chipDeTarjeta(v: Vigencia | null, alcance: number | null): ChipTarjeta | null {
  if (!v) return null;
  if (v.estado === "vigente") {
    return alcance === 0
      ? { texto: "Vigente, sin prendas", tono: "ambar", title: "Rige hoy, pero no llega a ninguna prenda a la venta: no cambia ningún precio." }
      : { texto: "Vigente", tono: "verde" };
  }
  if (v.estado === "proxima") return { texto: v.enDias === 1 ? "Mañana" : `En ${v.enDias} días`, tono: "ambar" };
  return { texto: "Fuera de temporada", tono: "neutro" };
}

/** Las prendas del alcance de una campaña que quedarían con precio menor que su costo.
 *  El alcance es el que aplica la base: las etiquetadas a mano MÁS todas las de las
 *  categorías elegidas. El precio es el que de verdad se cobra: el % exacto, con la misma
 *  cuenta que la caja y `registrar_venta` (`descuentoDeCampana`, ADR-0302). */
export function prendasBajoCosto(
  pct: number | null,
  prendas: readonly PrendaConCosto[],
  categoriaIds: ReadonlySet<string>,
  varianteIdsManuales: ReadonlySet<string>,
): PrendaConCosto[] {
  if (pct === null || pct <= 0) return [];
  return prendas.filter((p) => {
    const alcanzada = varianteIdsManuales.has(p.id) || (p.categoriaId !== null && categoriaIds.has(p.categoriaId));
    // En céntimos: en coma flotante 19.90 − 3.98 = 15.919999… y avisaba bajo un costo de 15.92 que se cobra exacto.
    return alcanzada && totalDeLineas([{ cantidad: 1, precioUnitario: p.precio, descuentoUnitario: descuentoDeCampana(p.precio, pct) }]) < p.costo;
  });
}
