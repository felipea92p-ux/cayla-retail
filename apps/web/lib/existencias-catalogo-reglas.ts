// Reglas PURAS sobre lo que Existencias sabe del catálogo además de su stock: la marca de cada prenda y qué productos
// del catálogo la sede no tiene. Sin `createClient` (lo lee `existencias-catalogo.ts`), para que el cliente y las
// pruebas las usen como valor.
//
// Por qué existe (2026-09-26, análisis /pantalla de Existencias): la pantalla nace de las filas de `stock`. Una prenda
// del catálogo que la sede nunca recibió no tiene fila, así que no existe ahí: hoy TRU muestra 45 de sus 126 variantes
// activas... y los dos pantalones de marca CAYLA (41 variantes, 0 filas) no aparecen aunque la marca se busque. La
// marca de cada fila y la lista de «en el catálogo, sin stock aquí» salen de UNA lectura ligera de `productos`.

import type { ProductoSinStock } from "./existencias-vacio";

/** Un producto tal como lo lee `getCatalogoParaExistencias` (una fila por producto, tenga o no variantes activas). */
export type ProductoDeCatalogo = {
  id: string;
  referencia: string;
  marca: string | null;
  categoria: string | null;
  /** `productos.estado`: solo un producto «activo» se ofrece como «en el catálogo, sin stock aquí». */
  estado: string;
  /** `productos.estado_alta`: una prenda dada de alta al vuelo (Conteo) queda `pendiente` hasta que un líder la revisa; su nombre
   *  y su marca pueden estar mal escritos, así que las otras sedes no la ven como «del catálogo» hasta que se apruebe. */
  estadoAlta: string;
  /** Dato de prueba (D-54, ADR-0159): nunca se ofrece ni se nombra. */
  esPrueba: boolean;
  /** ¿Tiene al menos una variante activa? Sin ella no hay nada que tener ni pedir (p. ej. «Prenda sin Registrar», el producto del cargo especial). */
  conVariantesActivas: boolean;
};

/** Pone la marca a cada fila por su producto. Una fila cuyo producto no llegó (la lectura falló o el producto es nuevo) queda con `marca: null`. */
export function conMarca<T extends { productoId: string }>(filas: readonly T[], productos: readonly ProductoDeCatalogo[]): (T & { marca: string | null })[] {
  const marcaDe = new Map(productos.map((p) => [p.id, p.marca]));
  return filas.map((f) => ({ ...f, marca: marcaDe.get(f.productoId) ?? null }));
}

/**
 * Los productos activos y aprobados del catálogo, con alguna variante activa, que ESTA sede no tiene (ni una fila de
 * stock, ni siquiera en cero), sin los de prueba, por nombre. `filas` son las de la sede ANTES de ocultar los de prueba:
 * da igual, un producto de prueba nunca sale de aquí.
 */
export function productosSinStockEnSede(productos: readonly ProductoDeCatalogo[], filas: readonly { productoId: string }[]): ProductoSinStock[] {
  const conFila = new Set(filas.map((f) => f.productoId));
  return productos
    .filter((p) => p.estado === "activo" && p.estadoAlta === "aprobado" && p.conVariantesActivas && !p.esPrueba && !conFila.has(p.id))
    .map((p) => ({ id: p.id, referencia: p.referencia, marca: p.marca, categoria: p.categoria }))
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es"));
}

/** Las marcas que hay en las filas de la sede, sin repetir y por nombre (para el combo «Marca»). */
export function marcasDeLaSede(filas: readonly { marca?: string | null }[]): string[] {
  return Array.from(new Set(filas.map((f) => f.marca).filter((m): m is string => !!m))).sort((a, b) => a.localeCompare(b, "es"));
}
