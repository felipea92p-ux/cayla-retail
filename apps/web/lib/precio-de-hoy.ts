// Lo que cobra la caja HOY por una prenda, dicho en Catálogo (ADR-0472, Felipe 2026-10-21).
//
// El descuento de una campaña NO se guarda en `variantes.precio`: se calcula al cobrar (`fn_campanas_por_variante` y
// `fn_descuento_campana`), así que una campaña que termina devuelve sola el precio y nunca se descuenta dos veces. Por eso Editar
// producto, la lista de Productos y la vista rápida mostraban solo el precio de lista: al poner una etiqueta con descuento parecía
// que «el precio nuevo no se guardó», aunque la caja ya lo cobraba (Felipe, 2026-10-21). Esto calcula lo mismo que la caja, sobre lo
// que la pantalla ya tiene, para que la pantalla lo diga.
//
// CONTRATO
//   PROMETE: por variante, el precio de la tienda menos la campaña de mayor % que rige hoy (a igual %, por nombre: el orden de
//            `campanas_vigentes()`), con la cuenta de la caja al céntimo (`descuentoDeCampana`, ADR-0403); y, por prenda, el resumen
//            que se muestra («S/ 79.90 → S/ 71.90») y la frase de la ficha.
//   ASUME:   «hoy» es el de Lima (`hoyLima()`); el precio que llega ya es el de la tienda (el propio si lo tiene, ADR-0370).
//   NO HACE: no guarda nada. Qué campañas alcanzan a una prenda GUARDADA lo dice la base (`campanasQueCobra`, que lee
//            `fn_campanas_por_variante`); aquí solo se replica esa regla sobre lo que está en pantalla SIN guardar (Editar producto,
//            mientras se eligen etiquetas o se cambia la categoría), como ya hace el alta (`campanaDelAlta`).

import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";
import { mejorCampanaPorVariante, type CampanaDeVariante } from "./etiqueta-precio-reglas";
import { cambioEnLasTiendas, rigeEnSede, type CambioDePrecio, type DondeSeImprime } from "./etiqueta-campana";
import { fechaCorta, vigenciaDe } from "./etiqueta-vigencia";

export type { CampanaDeVariante };

/** Lo que paga el cliente por una prenda de `precio` con una campaña de `pct` %: la cuenta de la caja, en céntimos exactos. */
export function precioConDescuento(precio: number, pct: number): number {
  return totalDeLineas([{ cantidad: 1, precioUnitario: precio, descuentoUnitario: descuentoDeCampana(precio, pct) }]);
}

export type Rango = { desde: number; hasta: number };

/** Lo que dice Catálogo de una prenda con alguna variante rebajada hoy. */
export type PrecioDeHoy = {
  /** El precio de la tienda, sin campaña (de la variante más barata a la más cara). */
  lista: Rango;
  /** Lo que cobra la caja hoy, con la campaña donde la hay. */
  cobra: Rango;
  /** La campaña de mayor % entre las variantes rebajadas (a igual %, por nombre). */
  campana: CampanaDeVariante;
  /** Cuántas campañas distintas más rebajan alguna variante (la caja cobra la mayor de cada una, nunca las suma). */
  otras: number;
  rebajadas: number;
  total: number;
};

const rangoDe = (n: readonly number[]): Rango => ({ desde: Math.min(...n), hasta: Math.max(...n) });
const gana = (a: CampanaDeVariante, b: CampanaDeVariante) => a.pct > b.pct || (a.pct === b.pct && a.nombre.localeCompare(b.nombre, "es") < 0);

/**
 * El resumen de una prenda: `null` si ninguna de sus variantes con precio tiene hoy una campaña con descuento (entonces la pantalla
 * muestra el precio de siempre). `variantes` son las que se venden, con el precio de la tienda; `campanaDe` dice la campaña de cada una.
 */
export function precioDeHoy(
  variantes: readonly { id: string; precio: number }[],
  campanaDe: (varianteId: string) => CampanaDeVariante | null | undefined,
): PrecioDeHoy | null {
  const conPrecio = variantes.filter((v) => Number.isFinite(v.precio) && v.precio > 0);
  if (conPrecio.length === 0) return null;
  let campana: CampanaDeVariante | null = null;
  const campanas = new Set<string>();
  let rebajadas = 0;
  const cobra = conPrecio.map((v) => {
    const c = campanaDe(v.id);
    if (!c || !(c.pct > 0)) return v.precio;
    rebajadas++;
    campanas.add(c.etiquetaId);
    if (!campana || gana(c, campana)) campana = c;
    return precioConDescuento(v.precio, c.pct);
  });
  if (!campana) return null;
  return { lista: rangoDe(conPrecio.map((v) => v.precio)), cobra: rangoDe(cobra), campana, otras: campanas.size - 1, rebajadas, total: conPrecio.length };
}

/** Una campaña del vocabulario como la lee la ficha: su %, su temporada, las categorías donde rige sola y las tiendas donde da su
 *  descuento (vacío = todas las sedes, ADR-0486). */
export type CampanaDelVocabulario = {
  id: string;
  nombre: string;
  descuentoPct: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  categoriaIds: readonly string[];
  sedeIds: readonly string[];
};

/**
 * Por variante, la campaña que cobraría la caja HOY con lo que está en la pantalla: la regla de `fn_campanas_por_variante` (la
 * etiqueta está puesta en la variante o su categoría está elegida en la campaña; con descuento y en su temporada; el vocabulario ya
 * llega aprobado y activo) y, de varias, la mayor (`mejorCampanaPorVariante`, el mismo desempate de la caja).
 */
export function campanasDeLaFicha(
  variantes: readonly { id: string; etiquetaIds: readonly string[] }[],
  categoriaId: string | null,
  vocabulario: readonly CampanaDelVocabulario[],
  hoy: string,
): Map<string, CampanaDeVariante> {
  // Sin fechas rige siempre; con fechas, solo dentro de su temporada (una que viene o que ya pasó no rebaja hoy).
  const rigen = vocabulario.filter((e) => {
    if (e.descuentoPct === null || !(e.descuentoPct > 0)) return false;
    const v = vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
    return v === null || v.estado === "vigente";
  });
  const filas = variantes.flatMap((v) =>
    rigen
      .filter((e) => v.etiquetaIds.includes(e.id) || (categoriaId !== null && e.categoriaIds.includes(categoriaId)))
      .map((e) => ({ variante_id: v.id, etiqueta_id: e.id, etiqueta_nombre: e.nombre, descuento_pct: e.descuentoPct as number })),
  );
  return mejorCampanaPorVariante(filas, new Map(rigen.map((e) => [e.id, e.vigenteHasta] as const)));
}

// ---- Cómo se dice ---------------------------------------------------------------------------------------------------------------

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const montos = (r: Rango) => (r.hasta - r.desde < 0.005 ? soles(r.desde) : `de ${soles(r.desde)} a ${soles(r.hasta)}`);
const porcentaje = (pct: number) => `−${pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

/** «−10 %»: lo que dice la insignia junto al precio. */
export const insigniaCampana = (p: PrecioDeHoy) => porcentaje(p.campana.pct);

/** «Aniversario CAYLA (−10 %)», o «Aniversario CAYLA (−10 %) y otra campaña» si hay más de una. */
function nombreCampana(p: PrecioDeHoy): string {
  const base = `${p.campana.nombre} (${porcentaje(p.campana.pct)})`;
  return p.otras === 0 ? base : p.otras === 1 ? `${base} y otra campaña` : `${base} y ${p.otras} campañas más`;
}

/** Cierra la frase con un punto, sin duplicar el de la fecha abreviada («25 oct.»). */
const punto = (frase: string) => (frase.endsWith(".") ? frase : `${frase}.`);
const hastaCuando = (p: PrecioDeHoy) => (p.campana.hasta ? ` hasta el ${fechaCorta(p.campana.hasta)}` : "");
const enCuantas = (p: PrecioDeHoy) => (p.rebajadas < p.total ? ` en ${p.rebajadas} de ${p.total} variantes` : "");

/** Lo que se lee al pasar el mouse por la insignia (y lo que oye el lector): «Aniversario CAYLA (−10 %) hasta el 25 oct.: la caja
 *  cobra S/ 71.90 en vez de S/ 79.90.» */
export function detalleCampana(p: PrecioDeHoy): string {
  return `${nombreCampana(p)}${hastaCuando(p)}: la caja cobra ${montos(p.cobra)}${enCuantas(p)} en vez de ${montos(p.lista)}.`;
}

/**
 * La frase de Editar producto, junto al precio. `hoy` es lo guardado (lo que la caja cobra ahora) y `tras` lo que está en pantalla;
 * `listaTras`, el precio sin campaña de lo que está en pantalla (para «vuelve a cobrar»). `sede`: la tienda, solo si tiene precio
 * propio (ahí su caja cobra otro número que las demás). `null` si ni lo guardado ni lo de pantalla tienen campaña.
 *   · Igual que lo guardado: «Con Aniversario CAYLA (−10 %) la caja cobra S/ 71.90 hasta el 25 oct.»
 *   · Con una campaña nueva o un precio nuevo: «Al guardar, con … la caja cobrará S/ 71.90 …»
 *   · Sin la campaña que tenía: «Al guardar, la caja vuelve a cobrar S/ 79.90: ya no tendrá Aniversario CAYLA (−10 %).»
 */
export function fraseCajaCobra(
  hoy: PrecioDeHoy | null,
  tras: PrecioDeHoy | null,
  listaTras: Rango | null,
  sede: string | null = null,
): { texto: string; alGuardar: boolean } | null {
  const caja = sede ? `la caja de ${sede}` : "la caja";
  const dicho = (p: PrecioDeHoy, verbo: string) => punto(`con ${nombreCampana(p)} ${caja} ${verbo} ${montos(p.cobra)}${enCuantas(p)}${hastaCuando(p)}`);
  if (tras) {
    const ahora = dicho(tras, "cobra");
    if (hoy && dicho(hoy, "cobra") === ahora) return { texto: ahora.charAt(0).toUpperCase() + ahora.slice(1), alGuardar: false };
    return { texto: `Al guardar, ${dicho(tras, "cobrará")}`, alGuardar: true };
  }
  if (!hoy) return null;
  return {
    texto: listaTras
      ? `Al guardar, ${caja} vuelve a cobrar ${montos(listaTras)}: ya no tendrá ${nombreCampana(hoy)}.`
      : `Al guardar, ${caja} deja de aplicar ${nombreCampana(hoy)}.`,
    alGuardar: true,
  };
}

// ---- Reimprimir al guardar Editar producto ----------------------------------------------------------------------------------------

/** Un lado del guardado de la ficha (lo guardado, o lo que queda al guardar): las variantes que se venden, con el precio de la prenda, su
 *  categoría y el precio propio de cada tienda que lo tiene (ADR-0370: uno para toda la prenda, manda sobre el de cada talla). */
export type LadoDeLaFicha = {
  variantes: readonly { id: string; etiquetaIds: readonly string[]; precio: number }[];
  categoriaId: string | null;
  propios: ReadonlyMap<string, number>;
};

/**
 * Las variantes cuyo precio en caja de HOY cambia al guardar (otro precio, una campaña que entra, sale o cambia): su etiqueta de papel
 * dice el de antes. Tienda por tienda, porque una campaña puede regir solo en algunas (ADR-0486) y una tienda con precio propio no ve
 * el precio nuevo de la prenda (ADR-0370); lo dice como al guardar una campaña (`cambioEnLasTiendas`): en qué tiendas si no es lo mismo
 * en todas, y qué imprime el botón desde la sede de quien guarda (`donde.aqui`). Solo las variantes que están en los dos lados: una que
 * nace o deja de venderse no tenía o ya no necesita papel.
 */
export function cambianEnCajaAlGuardar(
  antes: LadoDeLaFicha,
  despues: LadoDeLaFicha,
  vocabulario: readonly CampanaDelVocabulario[],
  hoy: string,
  donde: DondeSeImprime,
): CambioDePrecio {
  const enSede = (sede: string | null) => {
    const rigen = vocabulario.filter((c) => rigeEnSede(c, sede));
    const cobra = (lado: LadoDeLaFicha) => {
      const propio = sede === null ? undefined : lado.propios.get(sede);
      const variantes = propio === undefined ? lado.variantes : lado.variantes.map((v) => ({ ...v, precio: propio }));
      const campanas = campanasDeLaFicha(variantes, lado.categoriaId, rigen, hoy);
      return { precios: cobraPorVariante(variantes, campanas), campanas };
    };
    const a = cobra(antes);
    const d = cobra(despues);
    const cambian = [...d.precios].filter(([id, precio]) => a.precios.has(id) && Math.abs((a.precios.get(id) as number) - precio) >= 0.005).map(([id]) => id);
    // Las que quedan con una campaña (entra, o cambia su %) y las que se cobran sin ninguna (sale, o cambió solo el precio).
    return { quedan: cambian.filter((id) => d.campanas.has(id)), salen: cambian.filter((id) => !d.campanas.has(id)) };
  };
  return cambioEnLasTiendas(enSede, donde, vocabulario.flatMap((c) => c.sedeIds));
}

/** El precio que cobra la caja hoy por variante, con la campaña de cada una (o sin ella). */
function cobraPorVariante(
  variantes: readonly { id: string; precio: number }[],
  campanas: ReadonlyMap<string, CampanaDeVariante>,
): Map<string, number> {
  return new Map(
    variantes.map((v) => {
      const c = campanas.get(v.id);
      return [v.id, c && c.pct > 0 && v.precio > 0 ? precioConDescuento(v.precio, c.pct) : v.precio] as const;
    }),
  );
}
