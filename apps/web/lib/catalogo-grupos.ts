// La grilla de Vender es el plan B: cuando la etiqueta no lee, la encargada de sede busca
// la prenda con los ojos. La pistola trae talla, color y precio sola.
//
// Desde el 2026-10-03 (ADR-0323) la grilla pinta UNA TARJETA POR PRENDA (`agruparPorPrenda`): los colores van
// adentro, como puntos, y las tallas del color elegido debajo. La de una tarjeta por prenda + color (decisión del
// 2026-09-14, `agruparCatalogo`) daba 114 tarjetas para 34 prendas en Tienda TRU, con 1,04 tallas cada una, y en
// orden al azar: la grilla ordenaba por `sku`, vacío en 725 variantes. `agruparCatalogo` sigue siendo la pieza
// de adentro (un grupo por color) y la usan otras pantallas.
//
// Sin DOM ni React: se prueba sola. El padre (`PuntoDeVenta`) la memoiza y el catálogo
// (`PuntoDeVentaCatalogo`) solo la pinta.

export type VarianteAgrupable = {
  varianteId: string;
  referencia: string;
  color: string | null;
  talla: string | null;
  precio: number;
  stockAqui: number;
  /** Lo del almacén de esta sede (D-40): no se cobra, pero una talla con el piso en 0 y almacén no está «agotada». */
  almacenAqui?: number | null;
  categoria: string | null;
  fotoUrl: string | null;
};

export type TallaDelGrupo<T> = {
  /** La variante entera: es lo que va al ticket al tocar la talla. */
  variante: T;
  /** Etiqueta que se lee en el chip («M», «32», «Única»). */
  talla: string;
  stockAqui: number;
  /** Lo del almacén de esta sede; 0 sin almacén o sin dato. */
  almacenAqui: number;
};

export type GrupoCatalogo<T> = {
  /** Estable entre renders (`key` de React): referencia + color, separados por el
   *  separador de unidad ASCII (``, escrito como escape — nunca el byte crudo,
   *  que hace que git trate el archivo como binario). */
  clave: string;
  referencia: string;
  color: string | null;
  categoria: string | null;
  /** La de la primera variante del grupo que tenga foto — todas comparten prenda+color,
   *  así que comparten foto. */
  fotoUrl: string | null;
  /** Ordenadas como se leen en tienda (ver `ordenTalla`). */
  tallas: TallaDelGrupo<T>[];
  stockTotal: number;
  /** Lo que hay en el almacén de esta sede, sumando las tallas: con `stockTotal` en 0 y esto > 0, la tarjeta no está
   *  agotada — está en el almacén (D-40). */
  almacenTotal: number;
  /** La sede separa piso y almacén (una tienda): `stockTotal` es solo el PISO y la tarjeta lo dice así. En el Taller
   *  (sin almacén, `almacenAqui` null) `stockTotal` es todo lo que hay en la sede. */
  separaPiso: boolean;
  precioMin: number;
  precioMax: number;
};

const SIN_TALLA = "Única";

export function agruparCatalogo<T extends VarianteAgrupable>(variantes: T[]): GrupoCatalogo<T>[] {
  // Map conserva el orden de inserción: el primer color de cada prenda que aparece en el
  // catálogo manda la posición de su tarjeta.
  const grupos = new Map<string, GrupoCatalogo<T>>();
  for (const v of variantes) {
    const clave = `${v.referencia}\u001f${v.color ?? ""}`;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        clave,
        referencia: v.referencia,
        color: v.color,
        categoria: v.categoria,
        fotoUrl: v.fotoUrl,
        tallas: [],
        stockTotal: 0,
        almacenTotal: 0,
        separaPiso: false,
        precioMin: v.precio,
        precioMax: v.precio,
      };
      grupos.set(clave, grupo);
    }
    // Una talla sin foto no le quita la foto al color: vale la de la primera talla que la tenga.
    grupo.fotoUrl ??= v.fotoUrl;
    const almacenAqui = Math.max(0, v.almacenAqui ?? 0);
    grupo.tallas.push({ variante: v, talla: v.talla?.trim() || SIN_TALLA, stockAqui: v.stockAqui, almacenAqui });
    grupo.stockTotal += v.stockAqui;
    grupo.almacenTotal += almacenAqui;
    grupo.separaPiso ||= v.almacenAqui != null;
    grupo.precioMin = Math.min(grupo.precioMin, v.precio);
    grupo.precioMax = Math.max(grupo.precioMax, v.precio);
  }
  for (const grupo of grupos.values()) grupo.tallas.sort((a, b) => ordenTalla(a.talla, b.talla));
  return Array.from(grupos.values());
}

/** Las letras van de la más chica a la más grande; no alfabéticas (XS antes que S). */
const RANGO_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Orden en que se leen las tallas en la tienda: letras por tamaño, números por valor,
 *  y lo que no es ni lo uno ni lo otro al final, alfabético. */
export function ordenTalla(a: string, b: string): number {
  return peso(a) - peso(b) || a.localeCompare(b, "es");
}

function peso(talla: string): number {
  const t = talla.trim().toUpperCase();
  const letra = RANGO_LETRAS.indexOf(t);
  if (letra !== -1) return letra;
  const numero = Number(t);
  // Las numéricas van después de todas las letras, ordenadas entre sí por valor.
  if (t !== "" && Number.isFinite(numero)) return RANGO_LETRAS.length + numero;
  // Lo desconocido, después de cualquier número razonable.
  return Number.MAX_SAFE_INTEGER;
}

/** Una prenda de la grilla de Vender: sus colores, cada uno con sus tallas (ADR-0323). */
export type PrendaCatalogo<T> = {
  /** Estable entre renders: la referencia. Dos colores de la misma prenda comparten tarjeta. */
  clave: string;
  referencia: string;
  categoria: string | null;
  /** Ordenados por nombre (sin tildes): un color no cambia de lugar porque se vendió el último. */
  colores: GrupoCatalogo<T>[];
  /** Todas las tallas que existen en algún color, en el orden de la tienda («S M L»). */
  tallas: string[];
  /** Ninguna talla de ningún color se distingue: «Estándar», «Única» o sin talla. La tarjeta pide solo el color. */
  tallaUnica: boolean;
  stockTotal: number;
  almacenTotal: number;
  separaPiso: boolean;
  precioMin: number;
  precioMax: number;
};

const comparar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

/** Una tarjeta por prenda, ordenadas por nombre; adentro, un grupo por color (`agruparCatalogo`). */
export function agruparPorPrenda<T extends VarianteAgrupable>(variantes: T[]): PrendaCatalogo<T>[] {
  const prendas = new Map<string, PrendaCatalogo<T>>();
  for (const grupo of agruparCatalogo(variantes)) {
    let prenda = prendas.get(grupo.referencia);
    if (!prenda) {
      prenda = {
        clave: grupo.referencia,
        referencia: grupo.referencia,
        categoria: grupo.categoria,
        colores: [],
        tallas: [],
        tallaUnica: true,
        stockTotal: 0,
        almacenTotal: 0,
        separaPiso: false,
        precioMin: grupo.precioMin,
        precioMax: grupo.precioMax,
      };
      prendas.set(grupo.referencia, prenda);
    }
    prenda.colores.push(grupo);
    prenda.stockTotal += grupo.stockTotal;
    prenda.almacenTotal += grupo.almacenTotal;
    prenda.separaPiso ||= grupo.separaPiso;
    prenda.precioMin = Math.min(prenda.precioMin, grupo.precioMin);
    prenda.precioMax = Math.max(prenda.precioMax, grupo.precioMax);
  }
  for (const prenda of prendas.values()) {
    prenda.colores.sort((a, b) => comparar(a.color ?? "", b.color ?? ""));
    prenda.tallas = [...new Set(prenda.colores.flatMap((c) => c.tallas.map((t) => t.talla)))].sort(ordenTalla);
    prenda.tallaUnica = prenda.tallas.length <= 1;
  }
  return [...prendas.values()].sort((a, b) => comparar(a.referencia, b.referencia));
}

/**
 * «Solo con stock» por color: se quedan los colores con algo en el piso y la prenda sale si no le queda ninguno.
 * Lo escondido se cuenta por COLOR (una prenda con 5 colores y 2 solo en el almacén esconde 2), y de eso, cuánto
 * tiene prendas en el almacén de esta sede: no está agotado, falta bajarlo (D-40).
 */
export function filtrarConStock<T>(prendas: PrendaCatalogo<T>[], soloConStock: boolean): { prendas: PrendaCatalogo<T>[]; ocultos: number; ocultosEnAlmacen: number } {
  if (!soloConStock) return { prendas, ocultos: 0, ocultosEnAlmacen: 0 };
  let ocultos = 0;
  let ocultosEnAlmacen = 0;
  const visibles: PrendaCatalogo<T>[] = [];
  for (const prenda of prendas) {
    const colores = prenda.colores.filter((c) => c.stockTotal > 0);
    for (const c of prenda.colores) {
      if (c.stockTotal > 0) continue;
      ocultos += 1;
      if (c.almacenTotal > 0) ocultosEnAlmacen += 1;
    }
    if (colores.length) visibles.push(colores.length === prenda.colores.length ? prenda : { ...prenda, colores });
  }
  return { prendas: visibles, ocultos, ocultosEnAlmacen };
}

/** El color con el que abre la tarjeta: el primero con algo en el piso; si no, el primero en el almacén; si no, el primero.
 *  Desde el 2026-10-08 (Felipe) un color CON FOTO va primero dentro de cada escalón: la foto principal es la prenda real, no su
 *  ícono. Uno con foto pero sin nada (ni piso ni almacén) no le gana a uno sin foto que sí se puede vender. */
export function colorInicial<T>(prenda: PrendaCatalogo<T>): GrupoCatalogo<T> | undefined {
  const cs = prenda.colores;
  const piso = (c: GrupoCatalogo<T>) => c.stockTotal > 0;
  const almacen = (c: GrupoCatalogo<T>) => c.almacenTotal > 0;
  const foto = (c: GrupoCatalogo<T>) => !!c.fotoUrl;
  return (
    cs.find((c) => foto(c) && piso(c)) ??
    cs.find((c) => foto(c) && almacen(c)) ??
    cs.find(piso) ??
    cs.find(almacen) ??
    cs.find(foto) ??
    cs[0]
  );
}

/** Cuántos puntos de color caben en la tarjeta: hasta `max` se ven todos; con más, `max - 1` y un «+N». El elegido
 *  siempre está a la vista (toma el último lugar si estaba más allá). */
export function puntosAVista<T>(colores: GrupoCatalogo<T>[], elegido: string | undefined, max: number): { aVista: GrupoCatalogo<T>[]; resto: number } {
  if (colores.length <= max) return { aVista: colores, resto: 0 };
  const aVista = colores.slice(0, max - 1);
  const i = colores.findIndex((c) => c.clave === elegido);
  if (i >= max - 1) aVista[max - 2] = colores[i];
  return { aVista, resto: colores.length - aVista.length };
}

/** La línea bajo el nombre: «5 colores · S M L», «12 colores · talla única». */
export function resumenDePrenda<T>(prenda: PrendaCatalogo<T>): string {
  const n = prenda.colores.length;
  const tallas = prenda.tallaUnica ? (prenda.tallas[0] && prenda.tallas[0] !== "Única" ? prenda.tallas[0].toLowerCase() : "talla única") : prenda.tallas.join(" ");
  return `${n} ${n === 1 ? "color" : "colores"} · ${tallas}`;
}
