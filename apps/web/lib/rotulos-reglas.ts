/**
 * Rótulos de anaquel (ADR-0365): el letrero de 62 × 100 mm que sale de la Brother y se pega en el canto del anaquel o en el
 * frente de una pila de bolsas, para saber de lejos qué hay ahí («CHALECO · VALERIA · MIA»). Reemplaza al papel escrito a
 * plumón. Solo imprime: el sistema NO guarda en qué anaquel quedó cada modelo (Felipe 2026-10-09, «Solo imprimir»).
 *
 * Lógica pura: qué dice cada rótulo, de qué tamaño va el nombre para que quepa, y los enlaces de ida y vuelta.
 */
import { ordenTalla } from "./catalogo-grupos";
import { conDesde, desdeSeguro } from "./vuelta-productos";

/** Un modelo, con lo que el rótulo dice de él: sus colores y tallas ACTIVOS (lo que se puede encontrar en el anaquel). */
export type ModeloRotulo = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  categoria: string | null;
  colores: string[];
  tallas: string[];
};

/** Un rótulo impreso. `titulo` es la categoría compartida («Chalecos»); `modelos`, los nombres grandes. */
export type Rotulo = {
  clave: string;
  titulo: string | null;
  modelos: string[];
  colores: string[];
  tallas: string[];
  codigos: string[];
};

/** Hasta cuántos modelos entran juntos en un rótulo y se siguen leyendo de lejos. Más, y el nombre baja a letra de lista. */
export const MAX_JUNTOS = 4;
/** Hasta cuántos colores se nombran; el resto dice «y N más» (el rótulo es para encontrar el modelo, no un inventario). */
export const MAX_COLORES = 6;
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
  const categorias = new Set(modelos.map((m) => m.categoria));
  return {
    clave: modelos.map((m) => m.productoId).join("+"),
    // Con categorías distintas (una blusa y un chaleco) no hay un título que sea verdad para los dos: va sin título.
    titulo: categorias.size === 1 ? (modelos[0].categoria ?? null) : null,
    modelos: modelos.map((m) => m.referencia.trim()),
    colores: unicos(modelos.flatMap((m) => m.colores)),
    tallas: unicos(modelos.flatMap((m) => m.tallas)).sort(ordenTalla),
    codigos: modelos.flatMap((m) => (m.codigo ? [m.codigo] : [])),
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

/** «Blusa Valeria» en un rótulo titulado «Blusas» repite la categoría: el nombre grande queda en «Valeria», que es lo que
 *  distingue a un modelo del de al lado. Solo se quita si el nombre empieza con la categoría (singular o plural) y queda algo. */
export function nombreSinCategoria(referencia: string, categoria: string | null): string {
  if (!categoria) return referencia;
  const cat = sinTildes(categoria).toLowerCase();
  const raices = [cat, cat.replace(/(es|s)$/, "")].filter((r) => r.length >= 3);
  const palabras = referencia.trim().split(/\s+/);
  const primera = sinTildes(palabras[0] ?? "").toLowerCase();
  if (palabras.length > 1 && raices.includes(primera)) return palabras.slice(1).join(" ");
  return referencia;
}

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** El nombre grande, en el tamaño más grande que entra en una o dos líneas de 70 mm. Por el largo total de lo que se escribe:
 *  `xl` 13 mm (una palabra corta, se lee a 3 m) … `s` 5,5 mm (cuatro modelos juntos). Medido en `globals.css` (.rot-*). */
export type TamanoNombre = "xl" | "l" | "m" | "s";
export function tamanoNombre(nombres: readonly string[]): TamanoNombre {
  const largo = nombres.join(" · ").length;
  if (largo <= 9) return "xl";
  if (largo <= 16) return "l";
  if (largo <= 28) return "m";
  return "s";
}

/** «Beige · Marrón · Negro», con «y 3 más» si pasan de `MAX_COLORES`. */
export function textoColores(colores: readonly string[]): string {
  if (colores.length <= MAX_COLORES) return colores.join(" · ");
  return `${colores.slice(0, MAX_COLORES).join(" · ")} y ${colores.length - MAX_COLORES} más`;
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
