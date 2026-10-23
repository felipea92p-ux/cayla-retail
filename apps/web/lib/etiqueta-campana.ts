// Lo que un Líder escribe al configurar una campaña (descuento, fechas) y las
// reglas para aceptarlo. Las mismas reglas las cierra la base
// (`etiquetas_descuento_rango`, `etiquetas_vigencia_coherente`, y el RPC
// `actualizar_campana_etiqueta`); esto solo las dice con una frase clara ANTES
// de ir a la base, y sirve igual en el navegador y en la API.

import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";
import { urlEtiquetasDePrecio } from "./etiqueta-precio-reglas";
import { fechaCorta, vigenciaDe, type Vigencia } from "./etiqueta-vigencia";

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
export type PrendaConCosto = {
  id: string;
  categoriaId: string | null;
  precio: number;
  costo: number;
  nombre: string;
  enSede?: string | null;
  /** El modelo en su color (`producto·color`, la clave del pase de Insignias): una prenda, con todas sus tallas. Sin él, cada talla
   *  cuenta sola. Lo usan los conteos de la hoja y de la tarjeta (ADR-0488): «8 prendas» dicen lo mismo que el pase. */
  modelo?: string;
};

/** Cómo se nombra una prenda en el aviso: «Falda Emma (FAL-0008-NEG-M) · precio más bajo: S/ 69.90 en Trujillo» si el precio más bajo
 *  al que se cobra es el propio de una tienda; el nombre tal cual si es el de la prenda. Dice un HECHO (el precio más bajo y dónde), no
 *  una causa: si la prenda a su precio —o otra tienda— también queda bajo el costo, el texto no insinúa que arreglar esa tienda basta.
 *  (Un separador, no un paréntesis: el nombre ya lleva uno.) */
export function nombreBajoCosto(p: Pick<PrendaConCosto, "nombre" | "enSede" | "precio">): string {
  return p.enSede ? `${p.nombre} · precio más bajo: S/\u00a0${p.precio.toFixed(2)} en ${p.enSede}` : p.nombre;
}

// ---- En qué tiendas rige una campaña (ADR-0486) ------------------------------------------------------------------------
// Sin tiendas elegidas, rige en todas las sedes (como siempre). La base lo guarda en `campana_sedes` (sin filas = todas).

export type TiendaOpcion = { id: string; nombre: string };

/** Marcar o desmarcar una tienda. Si quedan marcadas TODAS, es «todas las sedes» (lista vacía): una tienda que se abra después no
 *  se quedaría fuera de una campaña que la persona quería en todas. */
export function alternarSede(elegidas: ReadonlySet<string>, tiendaId: string, tiendas: readonly TiendaOpcion[]): Set<string> {
  const nuevo = new Set(elegidas);
  if (nuevo.has(tiendaId)) nuevo.delete(tiendaId);
  else nuevo.add(tiendaId);
  return tiendas.length > 0 && tiendas.every((t) => nuevo.has(t.id)) ? new Set() : nuevo;
}

/** Lo que dice la tarjeta de una campaña limitada a tiendas; `null` si rige en todas. */
export function textoSedesDeCampana(sedeIds: readonly string[], tiendas: readonly TiendaOpcion[]): string | null {
  if (sedeIds.length === 0) return null;
  const nombres = sedeIds.map((id) => tiendas.find((t) => t.id === id)?.nombre).filter((n): n is string => Boolean(n));
  if (nombres.length !== sedeIds.length) return sedeIds.length === 1 ? "Solo en una tienda" : `Solo en ${sedeIds.length} tiendas`;
  return nombres.length === 1 ? `Solo ${nombres[0]}` : `Solo ${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

// ---- Cuánto alcanza una campaña, dicho ANTES de guardar --------------------------------
// La regla es la de la base (`fn_campanas_por_variante`): una prenda entra si está marcada a mano o si su categoría está
// elegida. Aquí solo se cuenta, con las prendas a la venta (variantes activas) que ya trae la página: sin ir a la base.

/** Los descuentos de siempre, a un toque en la hoja de campaña. El campo sigue para cualquier otro. */
export const DESCUENTOS_RAPIDOS = [10, 15, 20, 25, 30, 50] as const;

/** Cuántas prendas a la venta trae cada categoría: lo que dice cada chip de la hoja de campaña. */
export function prendasPorCategoria(prendas: readonly Pick<PrendaConCosto, "id" | "categoriaId" | "modelo">[]): Map<string, number> {
  // Una prenda es un modelo en un color: sus tallas cuentan una vez (como el pase de Insignias, ADR-0488).
  const modelos = new Map<string, Set<string>>();
  for (const p of prendas) {
    if (p.categoriaId === null) continue;
    const set = modelos.get(p.categoriaId) ?? new Set<string>();
    set.add(p.modelo ?? p.id);
    modelos.set(p.categoriaId, set);
  }
  return new Map([...modelos].map(([id, set]) => [id, set.size]));
}

export type AlcanceCampana = { porCategoria: number; aMano: number; total: number };

/** A cuántas prendas a la venta llega una campaña: las de sus categorías, más las marcadas a mano que no entran ya por su
 *  categoría. Una marcada a mano que ya no está a la venta (una talla desactivada) no cuenta: en caja no se puede cobrar. Una prenda
 *  es un modelo en un color (`modelo`), como en el pase: sus tallas cuentan una vez, y si una talla entra por su categoría el modelo
 *  ya no cuenta como «marcado a mano». */
export function alcanceCampana(
  prendas: readonly Pick<PrendaConCosto, "id" | "categoriaId" | "modelo">[],
  categoriaIds: ReadonlySet<string>,
  varianteIdsManuales: ReadonlySet<string>,
): AlcanceCampana {
  const porCategoria = new Set<string>();
  const aMano = new Set<string>();
  for (const p of prendas) {
    const modelo = p.modelo ?? p.id;
    if (p.categoriaId !== null && categoriaIds.has(p.categoriaId)) porCategoria.add(modelo);
    else if (varianteIdsManuales.has(p.id)) aMano.add(modelo);
  }
  const soloAMano = [...aMano].filter((m) => !porCategoria.has(m)).length;
  return { porCategoria: porCategoria.size, aMano: soloAMano, total: porCategoria.size + soloAMano };
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
  prendas: readonly Pick<PrendaConCosto, "id" | "categoriaId" | "modelo">[],
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

export type ChipTarjeta = {
  texto: string;
  tono: "verde" | "ambar" | "pizarra" | "neutro";
  title?: string;
  /** Lo que falta, en un segundo chip ámbar («Sin prendas», «Sin preparar»): un chip no parte su texto, y «En 23 días, sin
   *  preparar» se cortaba en la tarjeta a 1024 px. Con alerta, el de la temporada va en neutro: el verde diría que está bien. */
  alerta?: string;
};

/** El chip de la temporada. El ámbar dice «aquí falta algo»: una campaña vigente que no llega a ninguna prenda a la venta (en
 *  verde parecía que bajaba precios y no tocaba ninguno: «Para liquidar», producción 2026-10-17) y una que viene sin prendas
 *  («sin preparar»: Black Friday en 23 días sin ninguna se veía igual que el Día del Gato en 7 con sus 7). Una que viene lista va
 *  en pizarra, la de lo informativo; una que ya pasó dice cuándo («Pasó el 10 may.»), no «Fuera de temporada», que no decía si
 *  pasó o si venía. `alcance` es `null` cuando quien mira no ve los conteos: ahí no se juzga si está lista. */
export function chipDeTarjeta(v: Vigencia | null, alcance: number | null, hoy: string): ChipTarjeta | null {
  if (!v) return null;
  if (v.estado === "vigente") {
    return alcance === 0
      ? { texto: "Vigente", tono: "neutro", alerta: "Sin prendas", title: "Rige hoy, pero no llega a ninguna prenda a la venta: no cambia ningún precio." }
      : { texto: "Vigente", tono: "verde" };
  }
  if (v.estado === "proxima") {
    const cuando = v.enDias === 1 ? "Mañana" : `En ${v.enDias} días`;
    if (alcance === null) return { texto: cuando, tono: "ambar" };
    return alcance === 0
      ? { texto: cuando, tono: "neutro", alerta: "Sin preparar", title: "Todavía no llega a ninguna prenda a la venta: márcalas en «Prendas» o elige categorías en «Configurar»." }
      : { texto: cuando, tono: "pizarra" };
  }
  const anio = v.hasta.slice(0, 4) === hoy.slice(0, 4) ? "" : ` de ${v.hasta.slice(0, 4)}`;
  return { texto: `Pasó el ${fechaCorta(v.hasta)}${anio}`, tono: "neutro" };
}

// ---- Reimprimir al guardar una campaña (actividad 5, ADR-0441) ---------------------------------------------------------------
// La etiqueta de papel dice el precio que cobra la caja el día que se imprime (ADR-0180). Si al guardar una campaña cambia ese
// precio HOY —otro %, fechas que la hacen regir o dejar de regir, categorías que entran o salen—, el papel queda mintiendo hasta
// que alguien lo cambia. Una sola regla para las tres cosas: la prenda cuyo descuento de hoy no es el mismo antes y después.

type CampanaParaImprimir = { descuentoPct: number | null; vigenteDesde: string | null; vigenteHasta: string | null; categoriaIds: readonly string[] };

/** Las prendas a la venta (de `aLaVenta`) a las que guardar la campaña les cambia el precio en caja HOY: las que `quedan` con un
 *  descuento de esta campaña (otro %, o entran) y las que `salen` sin él (vuelven a su precio). Sin fechas rige siempre; una que
 *  viene o que ya pasó no rebaja hoy. No mira otras campañas: si una prenda sigue rebajada por otra mayor, se imprime igual y la
 *  etiqueta sale con lo que cobra la caja (no hace daño). */
export function prendasQueCambianDePrecioHoy(
  antes: CampanaParaImprimir,
  despues: CampanaParaImprimir,
  aLaVenta: readonly Pick<PrendaConCosto, "id" | "categoriaId">[],
  manuales: ReadonlySet<string>,
  hoy: string,
): { quedan: string[]; salen: string[] } {
  const pctHoy = (c: CampanaParaImprimir, p: Pick<PrendaConCosto, "id" | "categoriaId">) => {
    if (c.descuentoPct === null) return 0;
    const v = vigenciaDe(c.vigenteDesde, c.vigenteHasta, hoy);
    if (v && v.estado !== "vigente") return 0;
    const alcanzada = manuales.has(p.id) || (p.categoriaId !== null && c.categoriaIds.includes(p.categoriaId));
    return alcanzada ? c.descuentoPct : 0;
  };
  const quedan: string[] = [];
  const salen: string[] = [];
  for (const p of aLaVenta) {
    const ahora = pctHoy(despues, p);
    if (pctHoy(antes, p) !== ahora) (ahora > 0 ? quedan : salen).push(p.id);
  }
  return { quedan, salen };
}

// Cuántas tallas caben en un enlace a la impresión: cada id son 37 letras, y la pantalla vuelve a pedirlas a la base en otra URL.
// «Camisas y Blusas» tiene 354 tallas a la venta (producción, 2026-10-17): unos 13 KB, que el servidor o la base pueden rechazar.
const TOPE_TALLAS_EN_ENLACE = 150;

/** Adónde lleva «Imprimir sus etiquetas»: las tallas exactas si caben en un enlace; si son más, la impresión por campaña (la arma
 *  la pantalla con lo que la campaña alcanza HOY), siempre que ninguna haya salido de la campaña, porque esa impresión no las ve.
 *  `null` si no hay un enlace que sirva: entonces el aviso dice que se impriman por categoría desde Existencias. */
export function destinoReimprimir(cambian: { quedan: readonly string[]; salen: readonly string[] }, campanaId: string): string | null {
  const todas = [...cambian.quedan, ...cambian.salen];
  if (todas.length === 0) return null;
  if (todas.length <= TOPE_TALLAS_EN_ENLACE) return urlEtiquetasDePrecio({ variantes: todas });
  return cambian.salen.length === 0 ? urlEtiquetasDePrecio({ campana: campanaId }) : null;
}

/** El aviso de éxito al guardar, con un botón para imprimir si el papel quedó viejo. El botón no lleva número: la pantalla de
 *  impresión saca una etiqueta por UNIDAD en la tienda (14 tallas y colores pueden ser 32 etiquetas), y un «Imprimir las 14»
 *  que abre «Imprimir 32 etiquetas» hace dudar. */
export function avisoReimprimir(cambian: number, conEnlace = true): { detalle: string; boton: string | null } | null {
  if (cambian === 0) return null;
  const detalle =
    cambian === 1
      ? "Cambió el precio en caja de 1 prenda: su etiqueta de papel dice el de antes."
      : `Cambió el precio en caja de ${prendas(cambian)}: sus etiquetas de papel dicen el de antes.`;
  if (!conEnlace) return { detalle: `${detalle} Son muchas para abrirlas juntas: imprímelas por categoría desde Existencias.`, boton: null };
  return { detalle, boton: cambian === 1 ? "Imprimir su etiqueta" : "Imprimir sus etiquetas" };
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
