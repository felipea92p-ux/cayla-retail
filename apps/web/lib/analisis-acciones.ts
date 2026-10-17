// Análisis v4 (ADR-0357): a dónde lleva cada botón. Análisis no guarda nada por su cuenta: cada acción abre el flujo que ya
// existe, con las prendas marcadas (ADR-0245), y quien lo termina es esa pantalla. Un botón cuyo destino la cuenta no ve no se
// dibuja (ADR-0161): cada función devuelve null en ese caso, y la pantalla no muestra el botón.
//
// «Comprar» (A9, ADR-0357 act. 2026-10-16, decisión D8 de Felipe): abre una ORDEN DE COMPRA nueva (`/compras/ordenes/nueva`) con el proveedor, la
// tienda y el modelo, SIN cantidades; la orden se arma y se guarda allá (`lib/orden-compra-desde-analisis.ts` es el contrato). Quien ve Facturas y no
// Órdenes de compra cae en «Registrar factura», como antes. La rebaja de Etiquetas todavía no recibe prendas marcadas: «Liquidar» abre las
// etiquetas de esas prendas.

import type { AccesoAnalisis, DatosAnalisis, PrendaAnalisis, ProveedoresAnalisis, SedeAnalisis } from "./analisis-tipos";
import { modelosPorPedir, proveedorDelModelo } from "./analisis-a-quien-pedir";
import { urlOrdenNueva } from "./orden-compra-desde-analisis";
import { totalEnTienda } from "./analisis-reglas";
import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";
import { urlEtiquetasDePrecio } from "./etiqueta-precio-reglas";
import { RUTA_NUEVO_TRASLADO } from "./traslados-reglas";

/**
 * Lo que se hace prenda por prenda (bajar, mandar, liquidar, pedir) con lo que muestra Análisis: desde la decisión 12 de ADR-0357,
 * cada fila es un MODELO con sus tallas y colores adentro (`variantes`), y la acción va con todas ellas. Una fila sin `variantes`
 * (una talla suelta) va tal cual.
 */
function tallasDe<T extends object>(filas: readonly T[]): T[] {
  return filas.flatMap((f) => ("variantes" in f && Array.isArray(f.variantes) ? (f.variantes as T[]) : [f]));
}

/** Dónde vuelve «Volver» desde las pantallas que lo aceptan. */
export const RUTA_ANALISIS = "/gestion/analisis";

/**
 * Lo que «Comprar» necesita saber de la tienda: a dónde llega la orden (la tienda que se está analizando, `?destino=`) y a quién se le pide cada
 * modelo (`datos.proveedores`: la última compra o, sin ninguna, el proveedor anotado en su ficha). Sin los proveedores leídos (null) no se
 * adivina: se usa el de la última compra, como antes de A8.
 */
export type DondeComprar = { destinoId: string; proveedores: ProveedoresAnalisis | null };
export const dondeComprarDe = (datos: Pick<DatosAnalisis, "sede" | "proveedores">): DondeComprar => ({ destinoId: datos.sede.id, proveedores: datos.proveedores });

type ParaComprar = Pick<PrendaAnalisis, "origen" | "productoId" | "proveedorId">;
type AccesoComprar = Pick<AccesoAnalisis, "produccion" | "compras" | "ordenes">;

/** A quién va la orden: el proveedor del modelo si es uno a quien se le pide (de su última compra o de su ficha); un proveedor archivado o ninguno
 *  deja el campo vacío para que lo elija quien compra. */
function proveedorParaLaOrden(p: ParaComprar, donde: DondeComprar): string | null {
  if (!donde.proveedores) return p.proveedorId;
  const q = proveedorDelModelo(p, donde.proveedores);
  return q.fuente === "compra" || q.fuente === "catalogo" ? q.id : null;
}

/** Adónde lleva «Comprar» un modelo, y con qué se junta en «Comprar todas»: el Taller, una orden de compra (con su proveedor) o, sin Órdenes, la factura. */
type Destino = { tipo: "taller"; href: string } | { tipo: "orden"; proveedorId: string | null } | { tipo: "factura"; href: string };

function destinoDe(p: ParaComprar, a: AccesoComprar, donde: DondeComprar): Destino | null {
  if (p.origen === "taller") return a.produccion ? { tipo: "taller", href: `/produccion/ordenes?nueva=${encodeURIComponent(p.productoId)}` } : null;
  if (a.ordenes) return { tipo: "orden", proveedorId: proveedorParaLaOrden(p, donde) };
  // Sin Órdenes de compra, «Registrar factura» como hoy: con el proveedor de una compra REAL (el de la ficha del catálogo no es una factura).
  if (!a.compras) return null;
  return { tipo: "factura", href: p.proveedorId ? `/compras/nueva?prov=${encodeURIComponent(p.proveedorId)}` : "/compras/nueva" };
}

const claveDeDestino = (d: Destino): string => (d.tipo === "orden" ? `orden:${d.proveedorId ?? ""}` : d.tipo === "taller" ? "taller" : d.href);

/**
 * «Comprar»: del Taller, una orden de Producción con el modelo ya elegido; de terceros, una orden de compra nueva con su proveedor, la tienda y el modelo,
 * sin cantidades (A9, D8). Sin Órdenes de compra pero con Facturas, «Registrar factura». null si la cuenta no ve el módulo.
 */
export function hrefComprar(p: ParaComprar, a: AccesoComprar, donde: DondeComprar): string | null {
  const d = destinoDe(p, a, donde);
  if (!d) return null;
  return d.tipo === "orden" ? urlOrdenNueva({ proveedorId: d.proveedorId, destinoId: donde.destinoId, productoIds: [p.productoId] }) : d.href;
}

/**
 * «Comprar todas»: si todas salen del mismo sitio, ese (del Taller y de varios modelos, la lista de órdenes sin elegir uno; de terceros, UNA orden de compra
 * con todos los modelos); si salen de sitios distintos —o de proveedores distintos—, null: no se abren N órdenes, cada proveedor tiene su «Pedir a X» en «A quién
 * pedir» (A9).
 */
export function hrefComprarTodas(prendas: readonly ParaComprar[], a: AccesoComprar, donde: DondeComprar): string | null {
  if (prendas.length === 0) return null;
  const destinos = prendas.map((p) => destinoDe(p, a, donde));
  if (destinos.some((d) => d === null)) return null;
  const unicos = new Map(destinos.map((d) => [claveDeDestino(d!), d!]));
  if (unicos.size !== 1) return null;
  const d = [...unicos.values()][0]!;
  if (d.tipo === "orden") return urlOrdenNueva({ proveedorId: d.proveedorId, destinoId: donde.destinoId, productoIds: prendas.map((p) => p.productoId) });
  if (d.tipo === "taller") return prendas.length === 1 ? d.href : "/produccion/ordenes";
  return d.href;
}

/**
 * «Comprar todas» sobre una lista que mezcla lo que falta pedir con lo que YA viene en camino (el filtro «Todos» de «Se está acabando»): el destino
 * se calcula solo con lo que falta pedir (`modelosPorPedir`, la regla única), porque lo que ya viene no se compra otra vez ni debe decidir adónde
 * lleva el botón. null si nada falta pedir.
 */
export function hrefComprarLasQueFaltan<T extends Pick<PrendaAnalisis, "origen" | "productoId" | "proveedorId" | "llega">>(
  prendas: readonly T[],
  hoy: string,
  a: AccesoComprar,
  donde: DondeComprar,
): string | null {
  return hrefComprarTodas(modelosPorPedir(prendas, hoy), a, donde);
}

/**
 * «Pedir a X» (la fila de un proveedor en «A quién pedir»): una orden de compra nueva con ESE proveedor, la tienda y todos los modelos que se le piden,
 * sin cantidades (A9, D8). Solo con el módulo Órdenes de compra: abrir «Registrar factura» desde un botón que dice «Pedir» sería mentir (una factura es una
 * compra ya hecha). null si no hay modelos, son más de los que caben en una orden o la cuenta no ve Órdenes.
 */
export function hrefPedirAProveedor(modelos: readonly Pick<PrendaAnalisis, "productoId">[], proveedorId: string, a: Pick<AccesoAnalisis, "ordenes">, donde: Pick<DondeComprar, "destinoId">): string | null {
  return a.ordenes ? urlOrdenNueva({ proveedorId, destinoId: donde.destinoId, productoIds: modelos.map((m) => m.productoId) }) : null;
}

/**
 * «Elegir proveedor» (el grupo «Sin proveedor» de «A quién pedir»): la ficha del producto en Catálogo ▸ Productos, donde se anota su proveedor; con
 * varios modelos, la lista de Productos (cada uno se abre desde ella). Un modelo sin proveedor nunca entra en una compra a su nombre, así que la
 * tarjeta no se queda en «falta elegirlo»: lleva al lugar donde se elige. null si no hay modelos o la cuenta no puede editar el catálogo (la ficha
 * la mandaría a «Sin acceso»).
 */
export function hrefElegirProveedor(modelos: readonly Pick<PrendaAnalisis, "productoId">[], a: Pick<AccesoAnalisis, "catalogo">): string | null {
  if (!a.catalogo || modelos.length === 0) return null;
  return modelos.length === 1 ? `/productos/${encodeURIComponent(modelos[0]!.productoId)}/editar` : "/productos";
}

/**
 * «Enviar a Arequipa»: un traslado nuevo desde mi tienda con esas prendas (una de cada una, la persona ajusta) y el destino ya
 * elegido. Solo lo libre se puede mover; null si no hay nada que mover, si son más de las que caben en la URL o si la cuenta no
 * ve Traslados.
 */
export function hrefEnviar(prendas: readonly Pick<PrendaAnalisis, "varianteId" | "piso" | "almacen">[], destino: Pick<SedeAnalisis, "id">, a: Pick<AccesoAnalisis, "traslados">): string | null {
  if (!a.traslados) return null;
  // Una de cada una, como «Pedir» y «Reponer»: Análisis no sugiere cantidades (ADR-0231); cuántas, se elige en el traslado.
  const lineas = tallasDe(prendas).filter((p) => totalEnTienda(p) > 0).map((p) => ({ varianteId: p.varianteId, cantidad: 1 }));
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `${RUTA_NUEVO_TRASLADO}?lineas=${lineasEnUrl(lineas)}&destino=${encodeURIComponent(destino.id)}&desde=analisis`;
}

/** «Liquidar»: las etiquetas de esas prendas (la rebaja se elige allí). null si son más de las que caben o la cuenta no ve Etiquetas. */
export function hrefLiquidar(prendas: readonly Pick<PrendaAnalisis, "varianteId">[], a: Pick<AccesoAnalisis, "etiquetas">): string | null {
  const tallas = tallasDe(prendas);
  if (!a.etiquetas || tallas.length === 0 || tallas.length > MAX_VARIANTES_EN_URL) return null;
  return urlEtiquetasDePrecio({ variantes: tallas.map((p) => p.varianteId) }, RUTA_ANALISIS);
}

/** «Registrar ventas»: la cola de ventas sin su prenda (Por regularizar), si la cuenta la ve (ADR-0357, act. 2026-10-14). */
export const HREF_POR_REGULARIZAR = "/inventario/por-regularizar";
export function hrefRegistrarVentas(a: Pick<AccesoAnalisis, "regularizar">): string | null {
  return a.regularizar ? HREF_POR_REGULARIZAR : null;
}

/** «Reponer»: bajar al piso lo que está guardado (una de cada una). null si nada tiene almacén o la cuenta no ve Existencias. */
export function hrefReponerPiso(prendas: readonly Pick<PrendaAnalisis, "varianteId" | "almacen">[], a: Pick<AccesoAnalisis, "existencias">): string | null {
  if (!a.existencias) return null;
  const lineas = tallasDe(prendas).filter((p) => p.almacen > 0).map((p) => ({ varianteId: p.varianteId, cantidad: 1 }));
  if (lineas.length === 0 || lineas.length > MAX_VARIANTES_EN_URL) return null;
  return `/inventario/bajar?lineas=${lineasEnUrl(lineas)}`;
}

/** «Ver en Existencias»: la prenda en el stock de hoy; de un modelo, su primera talla (Existencias abre el detalle del modelo desde ella). */
export function hrefExistencias(p: Pick<PrendaAnalisis, "varianteId"> & { variantes?: readonly Pick<PrendaAnalisis, "varianteId">[] }, a: Pick<AccesoAnalisis, "existencias">): string | null {
  const talla = p.variantes?.[0] ?? p;
  return a.existencias ? `/inventario?variante=${encodeURIComponent(talla.varianteId)}` : null;
}

/** «Movimientos»: el libro de la prenda, buscado por su nombre. */
export const hrefMovimientos = (p: Pick<PrendaAnalisis, "nombre" | "color">, a: Pick<AccesoAnalisis, "movimientos">): string | null =>
  a.movimientos ? `/inventario/movimientos?q=${encodeURIComponent([p.nombre, p.color].filter(Boolean).join(" "))}` : null;

/** Lo que propone «Pedir a otra tienda» (el modal `PedirAOtraSedeModal`): una de cada una, de lo que esa tienda tiene. */
export function lineasParaPedir(prendas: readonly Pick<PrendaAnalisis, "varianteId" | "nombre" | "color" | "talla" | "otras">[], origenId: string) {
  return tallasDe(prendas).flatMap((p) => {
    const alla = p.otras.find((o) => o.sedeId === origenId);
    if (!alla || alla.stock < 1) return [];
    return [{ varianteId: p.varianteId, etiqueta: [p.nombre, p.color, p.talla].filter(Boolean).join(" · "), disponibleEnOrigen: alla.stock, cantidad: 1 }];
  });
}
