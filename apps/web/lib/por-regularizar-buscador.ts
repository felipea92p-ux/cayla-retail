// El buscador «¿Qué prenda es?» del modal Regularizar prenda (ADR-0328 actividad 5, decisión D2 del 2026-10-05).
//
// EL PROBLEMA. Felipe, con una venta de TRU anotada «Pantalones · Chocolate · Talla 28»: el buscador «me muestra todo, de todas las
// sedes, sin filtro, sin importar dónde estoy». Las candidatas iban primero, pero detrás venía el catálogo entero (miles de prendas,
// también las que la tienda nunca tuvo), así que la lista no decía nada sobre ESA venta y elegir una prenda ajena era tan fácil como
// elegir la correcta.
//
// CONTRATO
//   PROMETE: (1) `opcionesDeLaSede`: SOLO las prendas con stock disponible en la tienda DE LA VENTA que calzan con lo que anotó (o
//            escribió) la caja, en tramos rotulados y en este orden: la categoría que escribió la caja (si nombra otra), igual a lo
//            que anotó (el tramo exacto: `fn_candidatas_de_venta`, ver `hechosConExactas`) y color parecido; la sugerida siempre está
//            ahí y dice «Más probable». (2) `opcionesDelCatalogo`: esas mismas arriba y después todo el catálogo, con lo que más se
//            parece a lo anotado primero: la salida para la prenda que la tienda nunca cargó. (3) `textoSinCandidatas`: qué decir,
//            en palabras de tienda, cuando la tienda no tiene ninguna que calce.
//   ASUME:   que `SugerenciaVenta` ya trae las candidatas de la sede de la venta (las dos lecturas de la base son por sede).
//   NO HACE: no decide nada: la persona elige, y la base vuelve a exigir lo suyo al guardar (`regularizar_prenda`).
import type { Candidata, PrendaParaRegularizar, SugerenciaVenta, Tramo } from "./por-regularizar-candidatas";
import { tramoDe } from "./por-regularizar-candidatas";

export type ModoBuscador = "sede" | "catalogo";

/** Una opción del combo (la forma de `OpcionCombo` de `ComboBuscable`, sin depender de un componente). */
export type OpcionPrenda = { valor: string; texto: string; detalle: string; seccion: string };

/** Lo que el buscador necesita saber de la venta: lo que anotó la caja y en qué tienda se vendió. */
export type VentaDelBuscador = { categoria: string; talla: string; color: string; sede: string };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const ORDEN_TRAMOS: readonly Tramo[] = ["escrita", "exacta", "parecida"];

/** El título de cada tramo. Los tres se dicen distinto a propósito: «igual» nunca se mezcla con «parecido» (D1). */
export function tituloTramo(tramo: Tramo, s: Pick<SugerenciaVenta, "escrita">): string {
  if (tramo === "escrita") return `La categoría que escribió caja: ${s.escrita?.nombre ?? "otra"}`;
  return tramo === "exacta" ? "Igual a lo que anotó caja" : "Color parecido";
}

/** El título del resto del catálogo (solo en «Buscar en todo el catálogo»). */
export const TITULO_RESTO = "Resto del catálogo";

function detalle(c: Candidata, probable: Candidata | null): string {
  const p = c.prenda;
  return `${c === probable ? "Más probable · " : ""}${p.talla} · ${p.color} · ${p.codigo} · ${soles(p.precio)}`;
}

/**
 * Las candidatas de la tienda de la venta, por tramo (escrita → exacta → parecida). Dentro de cada tramo se respeta el orden de
 * probabilidad de `sugerenciaDeVenta`, y la «Más probable» queda en el tramo al que pertenece (nunca se mueve a otro).
 */
export function opcionesDeLaSede(s: SugerenciaVenta): OpcionPrenda[] {
  return ORDEN_TRAMOS.flatMap((tramo) =>
    s.candidatas
      .filter((c) => tramoDe(c) === tramo)
      .map((c) => ({ valor: c.prenda.id, texto: c.prenda.nombre, detalle: detalle(c, s.probable), seccion: tituloTramo(tramo, s) })),
  );
}

/**
 * Todo el catálogo: primero las de la tienda (los mismos tramos) y después el resto, con lo que más se parece a lo anotado arriba
 * (categoría —la escrita, si la caja escribió otra—, talla y color). Para la prenda que la tienda nunca cargó.
 */
export function opcionesDelCatalogo(
  prendas: readonly PrendaParaRegularizar[],
  s: SugerenciaVenta,
  venta: Pick<VentaDelBuscador, "categoria" | "talla" | "color">,
): OpcionPrenda[] {
  const deLaSede = opcionesDeLaSede(s);
  const ya = new Set(deLaSede.map((o) => o.valor));
  const categoria = s.escrita?.nombre ?? venta.categoria;
  const calce = (p: PrendaParaRegularizar) => Number(p.categoria === categoria) + Number(p.talla === venta.talla) + Number(p.color === venta.color);
  const resto = prendas
    .filter((p) => !ya.has(p.id))
    .map((p, i) => ({ p, i, n: calce(p) }))
    // `i` desempata: el orden del catálogo, siempre el mismo.
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ p }) => ({ valor: p.id, texto: p.nombre, detalle: `${p.talla} · ${p.color} · ${p.codigo} · ${soles(p.precio)}`, seccion: TITULO_RESTO }));
  return [...deLaSede, ...resto];
}

/** «de Pantalones en talla 28 y color Chocolate»: lo anotado, dicho en una frase y sin piezas vacías (un accesorio no trae talla). */
export function loAnotado(venta: Pick<VentaDelBuscador, "talla" | "color">, categorias: readonly string[]): string {
  const cats = categorias.filter(Boolean);
  const de = cats.length > 0 ? `de ${cats.join(" ni de ")}` : "";
  const talla = venta.talla ? `en talla ${venta.talla}` : "";
  const color = venta.color ? `${talla ? "y " : ""}color ${venta.color}` : "";
  return [de, talla, color].filter(Boolean).join(" ");
}

/**
 * Cuando la tienda de la venta no tiene ninguna prenda que calce, dicho en palabras de tienda y con la salida (el botón de al lado:
 * buscar en todo el catálogo). Con lo escrito distinto de lo anotado, nombra las dos categorías: se buscó en las dos.
 */
export function textoSinCandidatas(venta: VentaDelBuscador, s: Pick<SugerenciaVenta, "escrita">): string {
  const sede = venta.sede || "esta tienda";
  const categorias = s.escrita ? [s.escrita.nombre, venta.categoria] : [venta.categoria];
  const que = loAnotado(venta, categorias);
  return `En ${sede} no hay stock libre ${que || "de lo que anotó caja"}, ni de un color parecido. Si la prenda nunca se cargó aquí, búscala en todo el catálogo.`;
}
