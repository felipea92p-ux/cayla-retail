/**
 * Conteo conectado, parte 1 (spike `docs/maquetas/conteo-conectado-2026-09/`, Felipe 2026-09-26): las reglas puras que
 * usan la pantalla de contar, la cámara en ráfaga, la revisión y el detalle. Sin red y sin React, para poder probarlas.
 *
 * Lo que decide cada una, en palabras de la tienda:
 *  · «Faltan» se busca en el rack por modelo y color, no por talla suelta: `agruparPorPercha`.
 *  · Con la cámara, una pila de 12 blusas iguales tiene 12 veces el MISMO código: `debeContarLectura` cuenta el mismo código
 *    otra vez solo si la etiqueta salió del cuadro entre una lectura y la otra (la misma etiqueta quieta no suma sola).
 *  · Cada lectura suena y vibra distinto según qué pasó: `sonidoDeLectura`.
 *  · Al revisar, lo que el sistema tiene y nadie contó se decide, no se esconde: `noEncontradas`, `faltanDecidir`.
 *  · «Recontar» (opción A de Felipe) empieza desde 1 la primera lectura de una prenda marcada: `cantidadTrasLectura`.
 *  · Después de cerrar, los accesos llevan la lista ya cargada: `urlBajarTrasConteo`, `urlEtiquetasDe`.
 */

import type { FilaPrevisualizacion } from "./conteo-varianza";
import { compararTallas, type PrendaPendiente } from "./conteo-reglas";
import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";

// --- Faltan, por modelo y color -------------------------------------------------------------------------------------

export type TallaPendiente = { varianteId: string; talla: string | null; sku: string };
export type GrupoPercha = { clave: string; referencia: string; color: string | null; codigoBase: string; tallas: TallaPendiente[] };

/** El código de la percha: el de la talla sin su talla al final (`CMS-0001-NEG-M` → `CMS-0001-NEG`). Si el código no
 *  termina en la talla, el código entero: mejor de más que un código inventado. */
function codigoSinTalla(sku: string, talla: string | null): string {
  if (!sku || !talla) return sku;
  const fin = `-${talla}`.toLocaleUpperCase("es");
  return sku.toLocaleUpperCase("es").endsWith(fin) ? sku.slice(0, sku.length - fin.length) : sku;
}

/** Junta las pendientes por modelo + color (la «percha» de Existencias), con sus tallas en orden de talla. Conserva el
 *  orden de llegada de los grupos: `pendientesSinCifras` ya las trae por nombre y color. */
export function agruparPorPercha(pendientes: readonly PrendaPendiente[]): GrupoPercha[] {
  const grupos = new Map<string, GrupoPercha>();
  for (const p of pendientes) {
    const clave = JSON.stringify([p.referencia, p.color]);
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, referencia: p.referencia, color: p.color, codigoBase: codigoSinTalla(p.sku, p.talla), tallas: [] };
      grupos.set(clave, g);
    }
    g.tallas.push({ varianteId: p.varianteId, talla: p.talla, sku: p.sku });
  }
  for (const g of grupos.values()) g.tallas.sort((a, b) => compararTallas(a.talla, b.talla));
  return [...grupos.values()];
}

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

/** `suma`: otra unidad de una prenda ya contada · `nueva`: la primera unidad de una prenda · `desconocida`: el código no
 *  es de ninguna prenda del catálogo. Con la pistola se mira el rack, no la pantalla: el oído dice qué pasó. */
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

// --- Recontar (opción A) --------------------------------------------------------------------------------------------

/** La cantidad tras una lectura «suma»: +1 sobre lo anotado, o 1 si la prenda está marcada para recontar (su cifra
 *  anterior no cuenta: se vuelve a contar desde cero, a ciegas). */
export function cantidadTrasLectura(actual: number | undefined, recontando: boolean): number {
  return recontando ? 1 : (actual ?? 0) + 1;
}

// --- No encontradas, al revisar -------------------------------------------------------------------------------------

export type NoEncontrada = { varianteId: string; referencia: string; talla: string | null; color: string | null; codigo: string | null; sistema: number };
export type DecisionNoEncontrada = "cero" | "dejar";

/**
 * Lo que el sistema tiene aquí y nadie contó, dentro del alcance del conteo (`enAlcance`: la previsualización no conoce
 * el alcance por categoría). Solo lo que tiene stock: una prenda en 0 que nadie contó no le cambia nada a nadie.
 */
export function noEncontradas(filas: readonly FilaPrevisualizacion[], enAlcance: ReadonlySet<string>): NoEncontrada[] {
  const vistas = new Set<string>();
  const salida: NoEncontrada[] = [];
  for (const f of filas) {
    if (f.origen !== "no_contado" || !f.variante_id || !enAlcance.has(f.variante_id) || vistas.has(f.variante_id)) continue;
    const sistema = f.sistema ?? 0;
    if (sistema <= 0) continue;
    vistas.add(f.variante_id);
    salida.push({ varianteId: f.variante_id, referencia: f.referencia ?? "(sin referencia)", talla: f.talla, color: f.color, codigo: f.codigo, sistema });
  }
  return salida.sort(
    (a, b) => a.referencia.localeCompare(b.referencia, "es") || (a.color ?? "").localeCompare(b.color ?? "", "es") || compararTallas(a.talla, b.talla)
  );
}

/** Cuántas quedan sin decidir: cerrar espera a que cada una diga «no está» o «dejar como está». */
export function faltanDecidir(lista: readonly { varianteId: string }[], decisiones: Readonly<Record<string, DecisionNoEncontrada>>): number {
  return lista.filter((n) => !decisiones[n.varianteId]).length;
}

/** Las que se cuentan como 0 antes de cerrar (así `cerrar_conteo` las ajusta como a cualquier prenda contada). */
export function idsACero(lista: readonly { varianteId: string }[], decisiones: Readonly<Record<string, DecisionNoEncontrada>>): string[] {
  return lista.filter((n) => decisiones[n.varianteId] === "cero").map((n) => n.varianteId);
}

// --- Accesos con la lista cargada -----------------------------------------------------------------------------------

/**
 * «Bajar al piso» después de contar el piso: las prendas que quedaron en 0 en el piso y tienen algo libre en el almacén.
 * Viajan con 1 (la URL no acepta 0) y Bajar las recibe «por escanear»: la cantidad la pone quien baja, al leerlas
 * (ADR-0231: CAYLA no sugiere cuánto reponer; ADR-0237). `null` si no hay ninguna o son demasiadas para una URL.
 */
export function urlBajarTrasConteo(
  lineas: readonly { varianteId: string; contado: number }[],
  almacenLibre: ReadonlyMap<string, number>
): { url: string; cuantas: number } | null {
  const ids = [...new Set(lineas.filter((l) => l.contado === 0 && (almacenLibre.get(l.varianteId) ?? 0) > 0).map((l) => l.varianteId))];
  if (ids.length === 0 || ids.length > MAX_VARIANTES_EN_URL) return null;
  return { url: `/inventario/bajar?lineas=${lineasEnUrl(ids.map((varianteId) => ({ varianteId, cantidad: 1 })))}`, cuantas: ids.length };
}

/** Etiquetas de precio de unas tallas sueltas (el origen `?variantes=` de ADR-0237). `null` si no hay o no caben. */
export function urlEtiquetasDe(ids: readonly string[]): string | null {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0 || unicos.length > MAX_VARIANTES_EN_URL) return null;
  return `/etiquetas-de-precio?variantes=${unicos.join(",")}`;
}

/** Dónde se recuerda, en ESTE aparato, lo propio de un conteo abierto: las prendas anotadas a mano (para imprimir su
 *  etiqueta) y las marcadas para recontar. Es una comodidad del aparato, no un dato del conteo: sin almacenamiento, la
 *  pantalla funciona igual (parte 2 lo lleva a la base, con las tandas por persona). */
export function claveLocalConteo(conteoId: string, que: "a-mano" | "recontar"): string {
  return `cayla:conteo:${conteoId}:${que}`;
}
