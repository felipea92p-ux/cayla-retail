// Análisis → Compras (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A9; decisión D8 de Felipe, 2026-10-16): «Comprar» y
// «Pedir a X» abren una ORDEN DE COMPRA nueva (`/compras/ordenes/nueva`) con el proveedor, la tienda de destino y los modelos que se acaban,
// SIN cantidades: la orden la arma quien compra y Análisis no sugiere cuántas (ADR-0357, decisión 7). Este archivo es el contrato entre las dos
// pantallas, sin React ni red: Análisis arma el enlace (`urlOrdenNueva`) y Compras lo lee (`leerPedidoDeLaUrl`) y arma el borrador
// (`armarOrdenDeAnalisis`). La prueba es `orden-compra-desde-analisis.test.ts`.
//
// POR QUÉ POR ID DE MODELO Y NO CON LA CATEGORÍA Y LA MARCA EN LA URL: la categoría, la marca y el nombre los lee Compras de `productos` (la base
// manda), así que un enlace viejo o armado a mano no puede traer una marca que ya no existe ni un texto inventado; lo único que viaja son ids.
//
// NO GUARDA NADA: lo que arma es un borrador que la persona revisa. `crear_orden_compra` no se toca (la base juzga lo mismo que siempre).
//
// Todo lo que viene de la URL es dato de afuera (principio 9): un id que no es un id, repetido o que no existe se ignora sin romper la pantalla; un
// proveedor o una tienda que ya no están activos quedan vacíos para elegirlos, y una categoría o una marca archivadas también. Un MODELO se acepta si
// existe en `productos` (Análisis también lista los descontinuados, así que no se filtra por estado). Lo que se ignora se dice (`sinTraer`), nunca en silencio.

import { lineaVacia, TOPES, type LineaBorrador, type OrdenBorrador } from "./orden-compra-alta";
import type { DatosNuevaOrden } from "./ordenes-compra-reglas";

/** La pantalla donde se arma la orden. */
export const RUTA_NUEVA_ORDEN = "/compras/ordenes/nueva";

/** El valor de `?desde=` que manda Análisis: sirve solo para que «Volver» regrese allá. */
export const DESDE_ANALISIS = "analisis";

/** Las órdenes llevan hasta 100 líneas (`crear_orden_compra`): un enlace con más modelos no cabe en UNA orden. */
const MAX_MODELOS = TOPES.lineas;

/** Dónde vuelve «Volver» desde la orden que abrió Análisis: a «Se está acabando», que es de donde salió «Comprar». */
export const HREF_VOLVER_A_ANALISIS = "/gestion/analisis?vista=acaba";

const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los ids sin repetir, en el orden en que llegaron. */
const sinRepetir = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * El enlace de «Comprar» / «Pedir a X»: la orden nueva con ese proveedor (si se sabe), esa tienda de destino y esos modelos. null si no hay
 * modelos o son más de los que caben en una orden (el botón no se dibuja: una orden a medias sería peor que ninguna).
 */
export function urlOrdenNueva(p: { proveedorId?: string | null; destinoId?: string | null; productoIds: readonly string[] }): string | null {
  const ids = sinRepetir(p.productoIds);
  if (ids.length === 0 || ids.length > MAX_MODELOS) return null;
  const partes: string[] = [];
  if (p.proveedorId) partes.push(`prov=${encodeURIComponent(p.proveedorId)}`);
  if (p.destinoId) partes.push(`destino=${encodeURIComponent(p.destinoId)}`);
  partes.push(`modelos=${ids.map(encodeURIComponent).join(",")}`, `desde=${DESDE_ANALISIS}`);
  return `${RUTA_NUEVA_ORDEN}?${partes.join("&")}`;
}

/** Lo que dice la URL, ya limpio: ids con forma de id, sin repetir y sin pasarse de lo que cabe. Todavía no se sabe si existen. */
export type PedidoDeLaUrl = {
  proveedorId: string | null;
  destinoId: string | null;
  productoIds: string[];
  /** Cuántos modelos traía de más (más de los que caben en una orden): se ignoran y se dice. Es un MÍNIMO: de una lista armada a mano solo se lee la
   *  porción que cabe (`LARGO_MAXIMO_MODELOS`), y lo que está más allá ni se cuenta. Análisis nunca manda más de 100. */
  deMas: number;
  desdeAnalisis: boolean;
};

type Parametros = Record<string, string | string[] | undefined>;

/** Un parámetro repetido (`?prov=a&prov=b`) cuenta solo con el primero: la URL no decide por quien la armó dos veces. */
const unValor = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const idDe = (v: string | undefined): string | null => (v && ES_ID.test(v.trim()) ? v.trim().toLowerCase() : null);

/** Lo que cabe leer de `?modelos=`: 100 ids de 36 letras y sus comas. Más largo es un enlace armado a mano, y no se recorre entero. */
const LARGO_MAXIMO_MODELOS = (MAX_MODELOS + 1) * 37 + 64;

export function leerPedidoDeLaUrl(params: Parametros): PedidoDeLaUrl {
  const crudo = (unValor(params.modelos) ?? "").slice(0, LARGO_MAXIMO_MODELOS);
  const ids = sinRepetir(
    crudo
      .split(",")
      .map((x) => idDe(x))
      .filter((x): x is string => x !== null),
  );
  return {
    proveedorId: idDe(unValor(params.prov)),
    destinoId: idDe(unValor(params.destino)),
    productoIds: ids.slice(0, MAX_MODELOS),
    deMas: Math.max(0, ids.length - MAX_MODELOS),
    desdeAnalisis: unValor(params.desde) === DESDE_ANALISIS,
  };
}

/**
 * Una línea que trajo Análisis dice «Por revisar» (ADR-0284, regla 4) hasta que la persona la REVISA: toca su categoría, su marca o su descripción —lo
 * único que vino armado—, o la deja completa (con ✓). Escribir la cantidad o el precio no es revisar la marca: una línea con cantidad pero sin precio
 * sigue «Por revisar». Una línea común (la que la persona agregó) nunca la lleva.
 */
const CAMPOS_QUE_REVISAN_LA_LINEA: readonly (keyof LineaBorrador)[] = ["categoriaId", "marcaId", "descripcion"];

/** ¿Estos cambios son una revisión de lo que vino armado? */
export const revisaLaLinea = (cambios: Partial<LineaBorrador>): boolean => CAMPOS_QUE_REVISAN_LA_LINEA.some((c) => c in cambios);

/** ¿La línea todavía dice «Por revisar»? Llegó armada, nadie tocó lo armado y aún no está completa. */
export const lineaPorRevisar = (l: Pick<LineaBorrador, "prellenada">, completa: boolean): boolean => Boolean(l.prellenada) && !completa;

/** Un modelo como lo lee Compras de `productos`: lo único que la orden necesita de él. */
export type ModeloParaOrden = { id: string; referencia: string; categoriaId: string | null; marcaId: string | null };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** De las filas de `productos` a `ModeloParaOrden`. No confía en la forma: una fila sin id o sin nombre se descarta; si no es una lista, null. */
export function leerModelosParaOrden(filas: unknown): ModeloParaOrden[] | null {
  if (!Array.isArray(filas)) return null;
  const out: ModeloParaOrden[] = [];
  for (const f of filas) {
    if (!esObjeto(f)) continue;
    const id = texto(f.id);
    const referencia = texto(f.referencia);
    if (!id || !referencia) continue;
    out.push({ id, referencia, categoriaId: texto(f.categoria_id), marcaId: texto(f.marca_id) });
  }
  return out;
}

/** La orden que arma Análisis, con lo que la pantalla necesita saber de ella. */
export type OrdenDeAnalisis = {
  orden: OrdenBorrador;
  /** El destino vino de la URL y existe: cuenta como ya elegido (lo eligió la persona al apretar el botón). */
  destinoDeAnalisis: boolean;
  /** Cuántas líneas llegaron armadas. */
  prellenadas: number;
  /** Lo que no se pudo traer, en una frase para quien compra; null si llegó todo. */
  sinTraer: string | null;
};

/** El nombre de un modelo como descripción de su línea: cabe en la descripción (`TOPES.descripcion`), que es opcional y solo ayuda a reconocerla. */
const descripcionDe = (referencia: string) => referencia.slice(0, TOPES.descripcion);

/**
 * El borrador de la orden: el proveedor y el destino SI existen y están activos (si no, quedan vacíos para elegirlos), y una línea por modelo en
 * el orden en que Análisis los mandó, con su categoría, su marca y su nombre como descripción — la categoría y la marca solo si siguen
 * activas — y SIN cantidad ni precio. Una línea que llega armada va marcada `prellenada` hasta que la persona la toca (ADR-0284, regla 4: lo que
 * viene armado dice «Por revisar», no lleva ✓).
 *
 * `modelos` es null si no se pudieron leer (la base no respondió): no hay líneas y se dice, nunca se inventan.
 */
export function armarOrdenDeAnalisis(
  pedido: Pick<PedidoDeLaUrl, "proveedorId" | "destinoId" | "productoIds" | "deMas">,
  datos: Pick<DatosNuevaOrden, "proveedores" | "marcas" | "categorias" | "destinos" | "vinculos">,
  modelos: readonly ModeloParaOrden[] | null,
  destinoPorDefecto: string,
): OrdenDeAnalisis {
  const proveedorId = pedido.proveedorId && datos.proveedores.some((p) => p.id === pedido.proveedorId) ? pedido.proveedorId : "";
  const destinoDeAnalisis = Boolean(pedido.destinoId && datos.destinos.some((d) => d.id === pedido.destinoId));
  const destino = destinoDeAnalisis ? pedido.destinoId! : destinoPorDefecto;
  const categoriasActivas = new Set(datos.categorias.map((c) => c.id));
  const marcasActivas = new Set(datos.marcas.map((m) => m.id));
  // Como al elegir el proveedor a mano: si trae UNA sola marca, las líneas sin marca la toman.
  const suyas = proveedorId ? datos.vinculos.filter((v) => v.proveedorId === proveedorId) : [];
  const marcaUnica = suyas.length === 1 ? suyas[0]!.marcaId : "";

  const porId = new Map((modelos ?? []).map((m) => [m.id.toLowerCase(), m]));
  const lineas: LineaBorrador[] = [];
  for (const id of pedido.productoIds) {
    const m = porId.get(id);
    if (!m) continue;
    const marcaId = m.marcaId && marcasActivas.has(m.marcaId) ? m.marcaId : marcaUnica;
    lineas.push({
      ...lineaVacia(`l${lineas.length + 1}`, marcaId),
      categoriaId: m.categoriaId && categoriasActivas.has(m.categoriaId) ? m.categoriaId : "",
      descripcion: descripcionDe(m.referencia),
      prellenada: true,
    });
  }

  // Lo que no llegó: el proveedor o la tienda que ya no están, los modelos que ya no están (o no se leyeron) y los que no caben en una orden. Se dice,
  // nunca se calla (el proveedor se pudo archivar entre que Análisis se pintó y el clic).
  const noEncontradas = pedido.productoIds.length - lineas.length;
  const avisos: string[] = [];
  if (pedido.proveedorId && !proveedorId) avisos.push("El proveedor que traía Análisis ya no está activo: elige otro.");
  if (pedido.destinoId && !destinoDeAnalisis) avisos.push("La tienda que traía Análisis no recibe órdenes: elige a dónde llega.");
  if (modelos === null && pedido.productoIds.length > 0) {
    avisos.push("No se pudieron traer las prendas de Análisis. Agrégalas a mano con «+ Agregar otra prenda».");
  } else if (noEncontradas > 0 || pedido.deMas > 0) {
    const partes: string[] = [];
    if (noEncontradas > 0) partes.push(noEncontradas === 1 ? "1 prenda de Análisis ya no está en el catálogo" : `${noEncontradas} prendas de Análisis ya no están en el catálogo`);
    if (pedido.deMas > 0) partes.push(`${pedido.deMas === 1 ? "1 prenda" : `${pedido.deMas} prendas`} de más: una orden lleva hasta ${TOPES.lineas} líneas`);
    avisos.push(`${partes.join(". ")}. Agrega lo que falte con «+ Agregar otra prenda».`);
  }
  const sinTraer = avisos.length > 0 ? avisos.join(" ") : null;

  return {
    orden: { proveedorId, destino, entrega: "", nota: "", lineas: lineas.length > 0 ? lineas : [lineaVacia("l1", marcaUnica)] },
    destinoDeAnalisis,
    prellenadas: lineas.length,
    sinTraer,
  };
}

/** A dónde vuelve «Volver» y «Cancelar» en «Nueva orden de compra»: a Análisis solo si vino de ahí (`?desde=analisis`, ya leído por `leerPedidoDeLaUrl`,
 *  que ignora cualquier otro valor) y quien mira ve ese módulo; si no, a la lista de órdenes. Así la URL nunca decide un destino libre (mismo criterio que
 *  `volverDeNuevoTraslado`). */
export function volverDeNuevaOrden(desdeAnalisis: boolean, veAnalisis: boolean): { href: string; a: string } {
  return desdeAnalisis && veAnalisis ? { href: HREF_VOLVER_A_ANALISIS, a: "Análisis" } : { href: "/compras/ordenes", a: "Órdenes de compra" };
}
