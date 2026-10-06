// Análisis v4 (ADR-0356): a dónde lleva cada botón. Análisis no guarda nada por su cuenta: cada acción abre el flujo que ya
// existe, con las prendas marcadas (ADR-0245), y quien lo termina es esa pantalla. Un botón cuyo destino la cuenta no ve no se
// dibuja (ADR-0161): cada función devuelve null en ese caso, y la pantalla no muestra el botón.
//
// Lo que todavía no existe (2026-10-06): Compras no recibe prendas por URL (solo `?prov=`) y la rebaja de Etiquetas no recibe
// prendas marcadas: «Comprar» abre la compra con su proveedor y «Liquidar» abre las etiquetas de esas prendas.

import type { AccesoAnalisis, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { totalEnTienda } from "./analisis-reglas";
import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";
import { urlEtiquetasDePrecio } from "./etiqueta-precio-reglas";
import { RUTA_NUEVO_TRASLADO } from "./traslados-reglas";

/** Dónde vuelve «Volver» desde las pantallas que lo aceptan. */
export const RUTA_ANALISIS = "/inventario/resumen";

/**
 * «Comprar»: del Taller, una orden de Producción con el modelo ya elegido; de terceros, una compra nueva con su proveedor.
 * Sin origen conocido, la compra (lo más común); null si la cuenta no ve ese módulo.
 */
export function hrefComprar(p: Pick<PrendaAnalisis, "origen" | "productoId" | "proveedorId">, a: Pick<AccesoAnalisis, "produccion" | "compras">): string | null {
  if (p.origen === "taller") return a.produccion ? `/produccion/ordenes?nueva=${encodeURIComponent(p.productoId)}` : null;
  if (!a.compras) return null;
  return p.proveedorId ? `/compras/nueva?prov=${encodeURIComponent(p.proveedorId)}` : "/compras/nueva";
}

/**
 * «Comprar todas»: si todas salen del mismo sitio, ese (del Taller y de varios modelos, la lista de órdenes sin elegir uno);
 * si salen de sitios distintos, null: cada fila tiene el suyo.
 */
export function hrefComprarTodas(prendas: readonly Pick<PrendaAnalisis, "origen" | "productoId" | "proveedorId">[], a: Pick<AccesoAnalisis, "produccion" | "compras">): string | null {
  if (prendas.length === 0) return null;
  const destinos = new Set(
    prendas.map((p) => {
      const href = hrefComprar(p, a);
      return href?.startsWith("/produccion/ordenes") ? "/produccion/ordenes" : href;
    }),
  );
  if (destinos.size !== 1) return null;
  const unico = [...destinos][0] ?? null;
  return unico === "/produccion/ordenes" && prendas.length === 1 ? hrefComprar(prendas[0]!, a) : unico;
}

/**
 * «Enviar a Arequipa»: un traslado nuevo desde mi tienda con esas prendas (una de cada una, la persona ajusta) y el destino ya
 * elegido. Solo lo libre se puede mover; null si no hay nada que mover, si son más de las que caben en la URL o si la cuenta no
 * ve Traslados.
 */
export function hrefEnviar(prendas: readonly Pick<PrendaAnalisis, "varianteId" | "piso" | "almacen">[], destino: Pick<SedeAnalisis, "id">, a: Pick<AccesoAnalisis, "traslados">): string | null {
  if (!a.traslados) return null;
  const lineas = prendas.filter((p) => totalEnTienda(p) > 0).map((p) => ({ varianteId: p.varianteId, cantidad: totalEnTienda(p) }));
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `${RUTA_NUEVO_TRASLADO}?lineas=${lineasEnUrl(lineas)}&destino=${encodeURIComponent(destino.id)}&desde=analisis`;
}

/** «Liquidar»: las etiquetas de esas prendas (la rebaja se elige allí). null si son más de las que caben o la cuenta no ve Etiquetas. */
export function hrefLiquidar(prendas: readonly Pick<PrendaAnalisis, "varianteId">[], a: Pick<AccesoAnalisis, "etiquetas">): string | null {
  if (!a.etiquetas || prendas.length === 0 || prendas.length > MAX_VARIANTES_EN_URL) return null;
  return urlEtiquetasDePrecio({ variantes: prendas.map((p) => p.varianteId) }, RUTA_ANALISIS);
}

/** «Reponer»: bajar al piso lo que está guardado (una de cada una). null si nada tiene almacén o la cuenta no ve Existencias. */
export function hrefReponerPiso(prendas: readonly Pick<PrendaAnalisis, "varianteId" | "almacen">[], a: Pick<AccesoAnalisis, "existencias">): string | null {
  if (!a.existencias) return null;
  const lineas = prendas.filter((p) => p.almacen > 0).map((p) => ({ varianteId: p.varianteId, cantidad: 1 }));
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `/inventario/bajar?lineas=${lineasEnUrl(lineas)}`;
}

/** «Ver en Existencias»: la prenda en el stock de hoy. */
export const hrefExistencias = (p: Pick<PrendaAnalisis, "varianteId">, a: Pick<AccesoAnalisis, "existencias">): string | null =>
  a.existencias ? `/inventario?variante=${encodeURIComponent(p.varianteId)}` : null;

/** «Movimientos»: el libro de la prenda, buscado por su nombre. */
export const hrefMovimientos = (p: Pick<PrendaAnalisis, "nombre" | "color">, a: Pick<AccesoAnalisis, "movimientos">): string | null =>
  a.movimientos ? `/inventario/movimientos?q=${encodeURIComponent(`${p.nombre} ${p.color}`)}` : null;

/** Lo que propone «Pedir a otra tienda» (el modal `PedirAOtraSedeModal`): una de cada una, de lo que esa tienda tiene. */
export function lineasParaPedir(prendas: readonly Pick<PrendaAnalisis, "varianteId" | "nombre" | "color" | "talla" | "otras">[], origenId: string) {
  return prendas.flatMap((p) => {
    const alla = p.otras.find((o) => o.sedeId === origenId);
    if (!alla || alla.stock < 1) return [];
    return [{ varianteId: p.varianteId, etiqueta: [p.nombre, p.color, p.talla].filter(Boolean).join(" · "), disponibleEnOrigen: alla.stock, cantidad: 1 }];
  });
}
