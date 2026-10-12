/**
 * Rótulos de anaquel (ADR-0366): el letrero que sale de la Brother y se pega en el canto del anaquel o en el frente de una pila
 * de bolsas, para saber de lejos qué hay ahí («CHALECO VALERIA · MIA»). Reemplaza al papel escrito a plumón. Solo imprime: el
 * sistema NO guarda en qué anaquel quedó cada modelo (Felipe 2026-10-09, «Solo imprimir»).
 *
 * Desde la prueba en la tienda (Felipe, 2026-10-09, foto): sale en el MISMO papel que la etiqueta de precio (62 × 40,1 mm,
 * acostado), porque la Brother ya está configurada así y cambiar a 62 × 100 era un paso de más; y lleva el nombre lo más grande
 * que entra, la marca («Marca: Mias», en vez de los colores y sin el proveedor, Felipe 2026-10-09) y las tallas.
 *
 * Lógica pura: qué dice cada rótulo, de qué tamaño va el nombre para que quepa, y los enlaces de ida y vuelta.
 */
import { ordenTalla } from "./catalogo-grupos";
import { conDesde, desdeSeguro } from "./vuelta-productos";

/** Un modelo, con lo que el rótulo dice de él: su marca y sus tallas ACTIVAS. */
export type ModeloRotulo = {
  productoId: string;
  referencia: string;
  marca: string | null;
  tallas: string[];
};

/** Un rótulo impreso: los nombres grandes, y las marcas y tallas de todos juntos, sin repetir. */
export type Rotulo = {
  clave: string;
  modelos: string[];
  marcas: string[];
  tallas: string[];
};

/** Hasta cuántos modelos entran juntos en un rótulo y se siguen leyendo de lejos. Más, y el nombre baja a letra de lista. */
export const MAX_JUNTOS = 4;
/** Copias de un mismo rótulo: dos cantos del anaquel, o una pila por talla. */
export const MAX_COPIAS = 20;
/** Cuántos modelos caben en la URL (36 caracteres por id). */
export const MAX_MODELOS_EN_URL = 100;

/** Un rótulo por modelo, o uno solo con todos (como el «CHALECO VALERIA MIA» a mano). Los modelos llegan en el orden en que
 *  se eligieron y así se quedan: quien arma el anaquel los pone de izquierda a derecha. */
export function armarRotulos(modelos: readonly ModeloRotulo[], juntar: boolean): Rotulo[] {
  if (modelos.length === 0) return [];
  if (!juntar || modelos.length === 1) return modelos.map((m) => unRotulo([m]));
  return [unRotulo(modelos)];
}

function unRotulo(modelos: readonly ModeloRotulo[]): Rotulo {
  return {
    clave: modelos.map((m) => m.productoId).join("+"),
    modelos: modelos.map((m) => m.referencia.trim()),
    marcas: unicos(modelos.flatMap((m) => (m.marca ? [m.marca] : []))),
    tallas: unicos(modelos.flatMap((m) => m.tallas)).sort(ordenTalla),
  };
}

function unicos(valores: readonly string[]): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const v of valores) {
    const clave = v.trim().toLocaleLowerCase("es");
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(v.trim());
  }
  return salida;
}

// ── El nombre, lo más grande que entra ───────────────────────────────────────────────────────────────

/** El papel (62 × 40,1 mm) menos el margen de 2,5 mm por lado: el ancho de una línea del nombre. */
export const ANCHO_NOMBRE_MM = 57;
/** El alto que le queda al nombre después de la marca (una línea) y las tallas. Medido en `app/estilos/rotulo.css`: 35,1 mm útiles
 *  − 3,9 de la marca − 4,8 de las tallas − 2 × 1,2 de separación = 24 mm; 23,5 deja medio milímetro de aire. */
export const ALTO_NOMBRE_MM = 23.5;
/** Ni una palabra corta («MIA») pasa de aquí: más grande ya no se lee mejor y se come el aire del rótulo. */
export const MAX_NOMBRE_MM = 14;
/** Interlineado del nombre (`line-height` en la hoja): las mayúsculas no tienen descendentes. */
export const INTERLINEA_NOMBRE = 1.02;
/** Hasta cuántas líneas puede ocupar el nombre. */
const MAX_LINEAS = 3;
/** Holgura para el redondeo del navegador y la impresora (4 %). */
const HOLGURA = 0.96;

/**
 * Ancho de cada letra de DM Sans en 800 y mayúsculas, en «em» (medido en el navegador el 2026-10-09: la M mide 0,88 y la I 0,27).
 * Con la tabla, el tamaño sale de lo que de verdad ocupa el nombre y no de un promedio: un promedio cortaba «CAMISA CROP CON AMARRES».
 */
const ANCHO_LETRA: Record<string, number> = {
  A: 0.703, B: 0.632, C: 0.73, D: 0.699, E: 0.575, F: 0.548, G: 0.769, H: 0.708, I: 0.267, J: 0.535, K: 0.65, L: 0.552, M: 0.88,
  N: 0.724, Ñ: 0.724, O: 0.774, P: 0.607, Q: 0.774, R: 0.624, S: 0.596, T: 0.591, U: 0.677, V: 0.7, W: 1.013, X: 0.667, Y: 0.631,
  Z: 0.572, "0": 0.696, "1": 0.359, "2": 0.567, "3": 0.595, "4": 0.645, "5": 0.612, "6": 0.624, "7": 0.527, "8": 0.624, "9": 0.624,
  " ": 0.25, "·": 0.247, "-": 0.569, ".": 0.25, ",": 0.25, "'": 0.25, "/": 0.4, "&": 0.75,
};
/** Una letra que no está en la tabla cuenta como la más ancha común (la O), para no quedarse corto. */
const LETRA_DESCONOCIDA = 0.78;

export function anchoEm(texto: string): number {
  let total = 0;
  for (const c of texto.toLocaleUpperCase("es")) {
    // «Á» mide como «A»: se busca la letra sin su tilde (la Ñ tiene su propia fila).
    const base = c === "Ñ" ? c : c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    total += ANCHO_LETRA[base] ?? LETRA_DESCONOCIDA;
  }
  return total;
}

/** Cuántas líneas salen si se corta como el navegador (palabra entera que no cabe, baja), con líneas de `ancho` em. */
function lineasConAncho(palabras: readonly string[], ancho: number): number {
  let lineas = 1;
  let actual = 0;
  for (const p of palabras) {
    const w = anchoEm(p);
    const conEspacio = actual === 0 ? w : actual + ANCHO_LETRA[" "] + w;
    if (conEspacio <= ancho + 1e-9) actual = conEspacio;
    else {
      lineas++;
      actual = w;
    }
  }
  return lineas;
}

/**
 * El tamaño del nombre en mm y en cuántas líneas cabe: el MÁS GRANDE posible (Felipe, 2026-10-09). Prueba 1, 2 y 3 líneas; para
 * cada una busca el corte más parejo (el ancho más chico de línea con el que el corte del navegador no pasa de esas líneas) y se
 * queda con el tamaño mayor que respeta el ancho y el alto. Lo usa la hoja como `font-size`, así que lo que se ve es lo que sale.
 */
export function medidaNombre(nombres: readonly string[]): { mm: number; lineas: number } {
  // Los nombres juntos van separados por «·», pegado al nombre anterior (si el siguiente baja, el punto no queda colgando).
  const palabras = nombres.flatMap((n, i) => {
    const p = n.trim().split(/\s+/).filter(Boolean);
    if (i < nombres.length - 1 && p.length > 0) p[p.length - 1] += " ·";
    return p;
  });
  if (palabras.length === 0) return { mm: MAX_NOMBRE_MM, lineas: 1 };
  // Anchos candidatos: cada tramo seguido de palabras (con pocas palabras son pocos). El corte óptimo para L líneas usa uno de ellos.
  const candidatos = new Set<number>();
  for (let i = 0; i < palabras.length; i++) {
    for (let j = i; j < palabras.length; j++) candidatos.add(anchoEm(palabras.slice(i, j + 1).join(" ")));
  }
  const anchos = [...candidatos].sort((a, b) => a - b);
  let mejor = { mm: 0, lineas: 1 };
  for (let lineas = 1; lineas <= MAX_LINEAS; lineas++) {
    const ancho = anchos.find((w) => lineasConAncho(palabras, w) <= lineas);
    if (ancho === undefined) continue;
    const porAncho = (ANCHO_NOMBRE_MM * HOLGURA) / ancho;
    const porAlto = (ALTO_NOMBRE_MM * HOLGURA) / (lineas * INTERLINEA_NOMBRE);
    const mm = Math.floor(Math.min(porAncho, porAlto, MAX_NOMBRE_MM) * 10) / 10;
    if (mm > mejor.mm) mejor = { mm, lineas: lineasConAncho(palabras, ANCHO_NOMBRE_MM / mm) };
  }
  return mejor;
}

/** «CAYLA» o, con varios modelos juntos de marcas distintas, «CAYLA / Zara». `null` si ninguno tiene: la línea no sale. */
export function textoVarios(valores: readonly string[]): string | null {
  return valores.length > 0 ? valores.join(" / ") : null;
}

/** Cuántas copias, de lo que se escribe en la caja: entero de 0 a `MAX_COPIAS` (0 = ese rótulo no sale). */
export function copiasDeTexto(texto: string): number {
  const n = Math.floor(Number(texto));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_COPIAS) : 0;
}

/** De dónde se llegó: decide a dónde vuelve «Volver». */
export type OrigenRotulos = "productos" | "existencias" | "almacen" | null;

/** El enlace a la pantalla de rótulos con esos modelos. `null` si son demasiados para una URL (la barra no ofrece el botón). */
export function urlRotulos(productoIds: readonly string[], origen: { desde: "existencias" | "almacen" } | { productos: string | null }): string | null {
  const ids = [...new Set(productoIds)];
  if (ids.length > MAX_MODELOS_EN_URL) return null;
  const base = ids.length > 0 ? `/rotulos?productos=${ids.join(",")}` : "/rotulos";
  if ("desde" in origen) return `${base}${base.includes("?") ? "&" : "?"}origen=${origen.desde}`;
  return conDesde(base, origen.productos);
}

export function origenDeParam(origen: string | string[] | undefined, desde: string | null): OrigenRotulos {
  if (desde) return "productos";
  const o = Array.isArray(origen) ? origen[0] : origen;
  return o === "existencias" || o === "almacen" ? o : null;
}

/** Adónde vuelve «Volver»: a la vista exacta de Productos, a Existencias o a Inicio (el de almacén vive en «/»). */
export function volverDeRotulos(origen: OrigenRotulos, desde: string | null): { href: string; a: string } {
  if (origen === "productos") return { href: desdeSeguro(desde) ?? "/productos", a: "Productos" };
  if (origen === "existencias") return { href: "/inventario", a: "Existencias" };
  return { href: "/", a: "Inicio" };
}
