import { normalizarBusqueda } from "./combo-reglas";
import type { PrendaRecepcion } from "./recepcion-envio-reglas";

// La galería de «Ya la tenemos» y «¿Esta prenda ya existe?» en Recibir (tablero «Treinta tareas de Recibir», tarea 9, 2026-11-14).
// El problema: la reposición se reconoce por la foto, pero la lista dejaba las 200 prendas de la categoría y solo las ORDENABA al escribir.
// Para descartar una candidata había que abrir su ficha y volver: unos 8 toques por prenda. Aquí se decide, sin red y sin azar, qué tarjetas
// quedan y en qué orden; el componente solo las dibuja.

/** La función de solo lectura que dice qué prendas ya mandó un proveedor (migración 20261114165000). */
export const RPC_RECIBIDAS_DEL_PROVEEDOR = "fn_recibidas_del_proveedor";

/** Cuántos colores se dibujan como puntos en una tarjeta; los demás se dicen con «+N». */
export const MAX_COLORES_EN_TARJETA = 4;

export type ColorDeTarjeta = { nombre: string; hex: string | null };

/** Los colores de la prenda, sin repetir, en el orden en que llegan sus variantes. «Sin color» no es un color: no se dibuja. */
export function coloresDeLaPrenda(prenda: Pick<PrendaRecepcion, "variantes">): ColorDeTarjeta[] {
  const vistos = new Map<string, ColorDeTarjeta>();
  for (const v of prenda.variantes) {
    if (!v.color) continue;
    const clave = normalizarBusqueda(v.color);
    if (!vistos.has(clave)) vistos.set(clave, { nombre: v.color, hex: v.colorHex ?? null });
  }
  return [...vistos.values()];
}

/** Todo lo que la persona puede escribir para encontrarla: nombre, código (de la prenda y de sus variantes), marca y colores. */
function textoBuscable(p: PrendaRecepcion): string {
  return normalizarBusqueda(
    [p.nombre, p.codigo, p.marca?.nombre ?? null, ...p.variantes.flatMap((v) => [v.color, v.codigo])].filter(Boolean).join(" "),
  );
}

/** Lo que ya se sabe del modelo que llegó: su costo y su precio de venta, si alguien los dijo (la compra, lo anotado al contar). */
export type ReferenciaDelModelo = { costo: number | null; precio: number | null };

/** La referencia a partir de lo que se ve en pantalla: el costo como se escribe en su campo («35», «35,50») y el precio sugerido. `null` si no hay nada. */
export function referenciaDe(costoTexto: string | null, precio: number | null): ReferenciaDelModelo | null {
  const t = costoTexto?.trim().replace(",", ".") ?? "";
  const costo = t && Number.isFinite(Number(t)) && Number(t) > 0 ? Number(t) : null;
  const p = precio != null && precio > 0 ? precio : null;
  return costo == null && p == null ? null : { costo, precio: p };
}

/** El costo y el precio que comparten todas las líneas de la compra de una categoría; si difieren, ese dato no se usa (no se adivina cuál es). */
export function referenciaComun(pares: readonly ReferenciaDelModelo[]): ReferenciaDelModelo | null {
  const unico = (vs: (number | null)[]) => {
    const con = [...new Set(vs.filter((v): v is number => v != null && v > 0))];
    return con.length === 1 ? con[0] : null;
  };
  const costo = unico(pares.map((r) => r.costo));
  const precio = unico(pares.map((r) => r.precio));
  return costo == null && precio == null ? null : { costo, precio };
}

/** Cuánto se parece por plata: «mismo» (los dos a menos de 2 %), «parecido» (en promedio a menos de 15 %) o nada. */
export type ParecidoPorPlata = "mismo" | "parecido" | null;

const TOLERANCIA_MISMO = 0.02;
const TOLERANCIA_PARECIDO = 0.15;

/** El valor que representa a la prenda: la mediana de sus variantes con valor (una talla grande más cara no la mueve). */
function mediana(valores: readonly (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** La distancia relativa promedio de costo y precio contra lo que llegó; `null` si no hay ni un par con que comparar. */
function compararPorPlata(prenda: Pick<PrendaRecepcion, "variantes">, ref: ReferenciaDelModelo | null | undefined): { costo?: number; precio?: number } | null {
  if (!ref) return null;
  const fuera: { costo?: number; precio?: number } = {};
  const costo = mediana(prenda.variantes.map((v) => v.costo));
  const precio = mediana(prenda.variantes.map((v) => v.precio));
  if (ref.costo && ref.costo > 0 && costo != null) fuera.costo = Math.abs(costo - ref.costo) / ref.costo;
  if (ref.precio && ref.precio > 0 && precio != null) fuera.precio = Math.abs(precio - ref.precio) / ref.precio;
  return fuera.costo === undefined && fuera.precio === undefined ? null : fuera;
}

/** La distancia relativa de costo y de precio contra lo que llegó (las que se pueden comparar); `null` si no hay ni un par. */
export function distanciaPorPlata(prenda: Pick<PrendaRecepcion, "variantes">, ref: ReferenciaDelModelo | null | undefined): number[] | null {
  const c = compararPorPlata(prenda, ref);
  return c ? [c.costo, c.precio].filter((d): d is number => d !== undefined) : null;
}

export function parecidoPorPlata(prenda: Pick<PrendaRecepcion, "variantes">, ref: ReferenciaDelModelo | null | undefined): ParecidoPorPlata {
  const partes = distanciaPorPlata(prenda, ref);
  if (!partes) return null;
  if (partes.every((d) => d <= TOLERANCIA_MISMO)) return "mismo";
  return partes.reduce((a, b) => a + b, 0) / partes.length <= TOLERANCIA_PARECIDO ? "parecido" : null;
}

/** Lo que dice `fn_recibidas_del_proveedor`: la última vez que llegó cada prenda de ese proveedor. Lo que no se entiende se ignora. */
export function leerRecibidasDelProveedor(data: unknown): Map<string, string> {
  const fuera = new Map<string, string>();
  if (!Array.isArray(data)) return fuera;
  for (const f of data) {
    if (!f || typeof f !== "object") continue;
    const { producto_id, ultima_vez } = f as Record<string, unknown>;
    if (typeof producto_id === "string" && typeof ultima_vez === "string" && !Number.isNaN(Date.parse(ultima_vez))) fuera.set(producto_id, ultima_vez);
  }
  return fuera;
}

export type ContextoDeLaGaleria = {
  busqueda: string;
  /** Las marcas que ya trae este envío. */
  marcasDelEnvio?: readonly (string | null)[];
  /** `productoId` → la última vez que llegó de este proveedor (ISO). */
  recibidas?: ReadonlyMap<string, string>;
  /** El costo y el precio del modelo que llegó. */
  referencia?: ReferenciaDelModelo | null;
};

/**
 * Las tarjetas que quedan y su orden (Felipe 2026-11-14: «primero lo del proveedor y los que tengan el mismo precio y costo, para que se vayan
 * ordenando arriba las más parecidas»).
 * · Con algo escrito, quedan SOLO las que tienen todas sus palabras (sin tildes ni mayúsculas, en cualquier orden): «blusa roja» encuentra
 *   la «Blusa Aurora» que tiene el color Rojo.
 * · El orden, de más a menos parecida: lo que este proveedor ya mandó → mismo costo y precio → costo y precio parecidos → las marcas del envío →
 *   la que se acerca más por plata → la que llegó más recién → el nombre. Nada se esconde por el orden, y no depende del orden de la base.
 */
export function galeriaDePrendas(prendas: readonly PrendaRecepcion[], { busqueda, marcasDelEnvio = [], recibidas, referencia }: ContextoDeLaGaleria): PrendaRecepcion[] {
  const palabras = normalizarBusqueda(busqueda).split(" ").filter(Boolean);
  const delEnvio = new Set(marcasDelEnvio.filter((m): m is string => Boolean(m)));
  const llaves = (p: PrendaRecepcion) => {
    const llego = recibidas?.get(p.productoId) ?? null;
    const plata = parecidoPorPlata(p, referencia);
    const partes = distanciaPorPlata(p, referencia);
    return {
      proveedor: llego ? 0 : 1,
      plata: plata === "mismo" ? 0 : plata === "parecido" ? 1 : 2,
      marca: p.marca?.id && delEnvio.has(p.marca.id) ? 0 : 1,
      distancia: partes ? partes.reduce((a, b) => a + b, 0) / partes.length : Number.POSITIVE_INFINITY,
      llego: llego ? -Date.parse(llego) : 0,
    };
  };
  return prendas
    .filter((p) => {
      if (palabras.length === 0) return true;
      const texto = textoBuscable(p);
      return palabras.every((w) => texto.includes(w));
    })
    .map((p, i) => ({ p, i, k: llaves(p) }))
    .sort(
      (a, b) =>
        a.k.proveedor - b.k.proveedor ||
        a.k.plata - b.k.plata ||
        a.k.marca - b.k.marca ||
        (a.k.distancia === b.k.distancia ? 0 : a.k.distancia < b.k.distancia ? -1 : 1) ||
        a.k.llego - b.k.llego ||
        a.p.nombre.localeCompare(b.p.nombre, "es", { sensitivity: "base" }) ||
        a.i - b.i,
    )
    .map(({ p }) => p);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * El porqué de la tarjeta, en una línea corta («Poco texto a la vista»): «Llegó el 2 nov», «Mismo costo y precio», o los dos con «·».
 * Con la fecha de Lima, no la del navegador. `null` si no hay nada que decir.
 */
export function porQueArriba(prenda: PrendaRecepcion, { recibidas, referencia }: Pick<ContextoDeLaGaleria, "recibidas" | "referencia">): string | null {
  const llego = recibidas?.get(prenda.productoId);
  const plata = parecidoPorPlata(prenda, referencia);
  const partes: string[] = [];
  if (llego) {
    const d = new Date(Date.parse(llego) - 5 * 3600 * 1000); // Lima, UTC−5, sin horario de verano
    partes.push(`Llegó el ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`);
  }
  // Dice solo lo que se comparó: sin el costo del modelo, «mismo precio», nunca «mismo costo y precio».
  const c = compararPorPlata(prenda, referencia);
  const que = c?.costo !== undefined && c?.precio !== undefined ? "costo y precio" : c?.costo !== undefined ? "costo" : "precio";
  const dos = que === "costo y precio";
  if (plata === "mismo") partes.push(`mismo ${que}`);
  else if (plata === "parecido") partes.push(`${que} ${dos ? "parecidos" : "parecido"}`);
  if (partes.length === 0) return null;
  const texto = partes.join(" · ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
