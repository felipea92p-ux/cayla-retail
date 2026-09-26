// Existencias por prenda (ADR-0237, spike docs/maquetas/existencias-conectada-2026-09/): la tabla de Existencias
// agrupa sus filas (una por talla) en PRENDAS — un modelo en un color, la misma «percha» de «Por colgar»
// (`clavePercha`) — y cada prenda muestra su curva de tallas en una línea. Lógica pura: la usan la lista, el detalle de
// la prenda y la barra de «varias a la vez»; nada aquí decide qué hay que reponer (eso es `calcularAccionHoy`, ADR-0231).

import { clavePercha, porColgar } from "./inventario-reglas";
import { compararTallas } from "./tallas";
import type { FilaExistencias } from "./inventario-v2";

/** Lo mínimo de una fila de Existencias que usa esta regla (las pruebas no arman una fila entera). */
export type FilaPrenda = Pick<
  FilaExistencias,
  | "varianteId"
  | "productoId"
  | "referencia"
  | "sku"
  | "talla"
  | "color"
  | "colorHex"
  | "fotoUrl"
  | "codigosBarras"
  | "pisoDisponible"
  | "almacenDisponible"
  | "disponible"
  | "apartado"
  | "danado"
  | "enTransito"
  | "accionHoy"
  | "marca"
>;

/** Cómo se pinta una talla en la curva. Sale de las mismas reglas de la tabla: «Por colgar» (`porColgar`) y «Acción hoy». */
export type EstadoTalla = "por_colgar" | "reponer" | "sin_stock" | "normal";

export function estadoTalla(f: FilaPrenda): EstadoTalla {
  if (f.disponible <= 0) return "sin_stock";
  if (porColgar(f)) return "por_colgar";
  if (f.accionHoy?.tipo === "reponer_a_piso") return "reponer";
  return "normal";
}

/** ¿Esta talla se puede bajar al piso hoy? Pide reponer (la regla única) y hay algo libre atrás: lo apartado no se mueve. */
export function sePuedeBajar(f: FilaPrenda): boolean {
  return f.accionHoy?.tipo === "reponer_a_piso" && (f.almacenDisponible ?? 0) > 0;
}

export type PrendaAgrupada<F extends FilaPrenda = FilaPrenda> = {
  clave: string;
  productoId: string;
  referencia: string;
  marca: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  /** Sus tallas en curva (XS, S, M… y luego la numeración), no en el orden en que llegaron. */
  tallas: F[];
  /** Sumas de lo LIBRE (neto de apartados), las mismas cifras que la tabla por talla. `null` donde no se separa piso y almacén. */
  piso: number | null;
  almacen: number | null;
  disponible: number;
  apartado: number;
  danado: number;
  enTransito: number;
  /** Cuántas tallas se pueden bajar al piso hoy (`sePuedeBajar`). */
  tallasParaBajar: number;
  /** Cuántas tallas no tienen ni una para vender en el piso y sí atrás (`porColgar`). */
  tallasPorColgar: number;
};

function sumarONull(filas: FilaPrenda[], campo: "pisoDisponible" | "almacenDisponible"): number | null {
  if (filas.some((f) => f[campo] === null)) return null;
  return filas.reduce((acc, f) => acc + (f[campo] ?? 0), 0);
}

/** Agrupa filas por prenda (modelo + color) respetando el orden en que llegan: la primera talla que aparece (por
 *  relevancia de la búsqueda, o por percha en «Por colgar») decide dónde va su prenda. */
export function agruparPorPrenda<F extends FilaPrenda>(filas: readonly F[]): PrendaAgrupada<F>[] {
  const grupos = new Map<string, F[]>();
  for (const f of filas) {
    const clave = clavePercha(f);
    const g = grupos.get(clave);
    if (g) g.push(f);
    else grupos.set(clave, [f]);
  }
  return [...grupos.entries()].map(([clave, grupo]) => {
    const tallas = [...grupo].sort((a, b) => compararTallas(a.talla ?? "", b.talla ?? ""));
    const primera = tallas[0];
    return {
      clave,
      productoId: primera.productoId,
      referencia: primera.referencia,
      marca: primera.marca ?? null,
      color: primera.color,
      colorHex: primera.colorHex,
      fotoUrl: primera.fotoUrl,
      tallas,
      piso: sumarONull(tallas, "pisoDisponible"),
      almacen: sumarONull(tallas, "almacenDisponible"),
      disponible: tallas.reduce((acc, f) => acc + f.disponible, 0),
      apartado: tallas.reduce((acc, f) => acc + f.apartado, 0),
      danado: tallas.reduce((acc, f) => acc + (f.danado ?? 0), 0),
      enTransito: tallas.reduce((acc, f) => acc + f.enTransito, 0),
      tallasParaBajar: tallas.filter(sePuedeBajar).length,
      tallasPorColgar: tallas.filter((f) => porColgar(f)).length,
    };
  });
}

/** `id:cantidad,id:cantidad`: el formato que ya leen «Mover mercadería» (`parsearLineasPrellenadas`) y ahora «Bajar al piso». */
export function lineasEnUrl(lineas: readonly { varianteId: string; cantidad: number }[]): string {
  return lineas
    .filter((l) => Number.isInteger(l.cantidad) && l.cantidad > 0)
    .map((l) => `${l.varianteId}:${l.cantidad}`)
    .join(",");
}

/** Lo que va a «Bajar al piso» desde lo marcado: solo las tallas que se pueden bajar. El 1 es solo la forma del enlace
 *  (`lineasEnUrl` no lleva ceros): «Bajar al piso» las recibe todas «por escanear», en 0, y cada lectura suma una
 *  (`lineasIniciales`, ADR-0237 act. 2026-09-26). CAYLA no sugiere cuánto reponer (ADR-0231): lo que se baja es lo que
 *  la vendedora escanea al colgar. */
export function lineasParaBajar(filas: readonly FilaPrenda[]): { varianteId: string; cantidad: number }[] {
  return filas.filter(sePuedeBajar).map((f) => ({ varianteId: f.varianteId, cantidad: 1 }));
}

/** Lo que va a «Mover mercadería»: las tallas con algo libre para mandar (el traslado sale del almacén; donde no se separa,
 *  de lo disponible), una unidad cada una — la pantalla de traslado topa y deja cambiar la cantidad. */
export function lineasParaTrasladar(filas: readonly FilaPrenda[]): { varianteId: string; cantidad: number }[] {
  return filas.filter((f) => (f.almacenDisponible ?? f.disponible) > 0).map((f) => ({ varianteId: f.varianteId, cantidad: 1 }));
}

/** Tope de variantes que viajan por URL: con más, el enlace se vuelve frágil (límites de largo de URL de ~8 KB, y cada
 *  uuid pesa 36 caracteres). 100 × 40 ≈ 4 KB. La barra avisa en vez de mandar un enlace cortado. */
export const MAX_VARIANTES_EN_URL = 100;

export function urlBajarAlPiso(filas: readonly FilaPrenda[]): string | null {
  const lineas = lineasParaBajar(filas);
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `/inventario/bajar?lineas=${lineasEnUrl(lineas)}`;
}

export function urlTrasladar(filas: readonly FilaPrenda[]): string | null {
  const lineas = lineasParaTrasladar(filas);
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `/inventario/mover?lineas=${lineasEnUrl(lineas)}`;
}

/** Etiquetas de precio de lo marcado. Con un solo producto va por `?producto=` (el origen de siempre, con su nombre en la
 *  cabecera); con varios, por `?variantes=`. */
export function urlEtiquetas(filas: readonly FilaPrenda[]): string | null {
  if (filas.length === 0 || filas.length > MAX_VARIANTES_EN_URL) return null;
  const productos = new Set(filas.map((f) => f.productoId));
  if (productos.size === 1) return `/etiquetas-de-precio?producto=${[...productos][0]}`;
  return `/etiquetas-de-precio?variantes=${filas.map((f) => f.varianteId).join(",")}`;
}

/** Normaliza un código leído (pistola, cámara o tipeo) para compararlo: sin espacios y sin mayúsculas. */
function normalizarCodigo(c: string): string {
  return c.trim().toLowerCase();
}

/** ¿Qué talla es este código? Busca el código EXACTO (el de la etiqueta o un código de barras), nunca un pedazo: con la
 *  pistola, «POL-0004-NEG-M» no puede abrir la L por parecerse. null = no es de ninguna prenda de esta sede. */
export function tallaPorCodigo<F extends FilaPrenda>(filas: readonly F[], codigo: string): F | null {
  const buscado = normalizarCodigo(codigo);
  if (!buscado) return null;
  return filas.find((f) => normalizarCodigo(f.sku) === buscado || f.codigosBarras.some((c) => normalizarCodigo(c) === buscado)) ?? null;
}
