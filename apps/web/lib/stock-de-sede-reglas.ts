// Cómo se arman las filas del stock de una sede (Existencias, Traslados ▸ Nuevo, Bajar al piso, Cuadrar, el conteo). Lógica pura: la usan
// `getStockPorUbicacion` (`lib/inventario-v2.ts`) y su prueba.
//
// EL PROBLEMA (medido en producción el 2026-11-13, `docs/innovacion/2026-11-13-cambiar-de-modulo.md` #4). La lectura del stock de la sede
// traía, por cada fila, la prenda entera embebida: talla, color, producto, categoría, fotos y códigos de barras. Con la RLS de cada una de
// esas tablas y por páginas de 1.000, tardaba 716 ms de media cada vez que alguien entraba a Existencias, y era lo más pesado de la pantalla.
//
// LO QUE SE HACE. Las cantidades se leen frescas y delgadas (como ya hace la caja, `getDisponibleEnSede`, ~111 ms) y lo que la fila dice de
// la prenda sale de la copia guardada del catálogo (`getCatalogo`), que se rehace sola cuando cambia algo del catálogo
// (`fn_catalogo_version`). Las dos lecturas terminan en `armarFilasStock`, la misma que usa la lectura completa de respaldo: la fila sale
// idéntica por los dos caminos.

import { codigoDeEtiqueta } from "./prenda-reglas";
import { esEstampado } from "./color-estampado-reglas";
import { sumarCantidades, type Cantidades, type FilaCantidadCruda } from "./inventario-reglas";
import type { FilaStock } from "./inventario-v2";
import type { VarianteCatalogo } from "./catalogo-v2";

/** Lo que una fila dice de su prenda: todo menos las cantidades. */
export type DetalleDeFila = Omit<FilaStock, keyof Cantidades>;

/**
 * El detalle de una fila desde la copia del catálogo, igual al que arma la lectura con todo embebido:
 * - el código es el de la etiqueta y, si falta, el `sku` legado (`codigoDeEtiqueta`);
 * - la foto de un estampado es la de SU color (ADR-0634) y la de cualquier otro, la principal del producto (`fotoDeLaFila`);
 * - el precio es el propio de la sede si lo tiene (Felipe 2026-10-09) y, si no, el de catálogo.
 */
export function detalleDesdeCatalogo(v: VarianteCatalogo, precioPropio: number | undefined): DetalleDeFila {
  const estampado = esEstampado({ tipo: v.colorTipo });
  return {
    varianteId: v.varianteId,
    productoId: v.productoId,
    sku: codigoDeEtiqueta(v),
    talla: v.talla,
    color: v.color,
    colorHex: v.colorHex,
    // La copia rellena «(sin referencia)» cuando la variante no trae producto; la fila de stock siempre dejó el vacío.
    referencia: v.productoId ? v.referencia : "",
    categoria: v.categoria,
    categoriaPrefijo: v.categoriaPrefijo ?? null,
    categoriaFamilia: v.categoriaFamilia ?? null,
    codigosBarras: v.codigosBarras,
    fotoUrl: estampado ? v.fotoUrl : (v.fotoPrincipal ?? null),
    colorEstampado: estampado,
    precio: precioPropio ?? v.precio,
    ...(precioPropio !== undefined ? { precioDeSede: true } : {}),
  };
}

/**
 * El detalle de cada prenda con stock en la sede, en el orden en que llegaron las filas, sacado de la copia del catálogo. Devuelve
 * también las que NO están en la copia: quien llama no se salta ninguna (lee esas en vivo), porque una prenda que falta en Existencias
 * parece una prenda sin stock.
 */
export function detallesDesdeCatalogo(
  filas: readonly Pick<FilaCantidadCruda, "variante_id">[],
  catalogo: readonly VarianteCatalogo[],
  precios: Readonly<Record<string, number>>,
): { detalles: Map<string, DetalleDeFila>; faltan: string[] } {
  const porId = new Map(catalogo.map((v) => [v.varianteId, v]));
  const detalles = new Map<string, DetalleDeFila>();
  const faltan = new Set<string>();
  for (const { variante_id: id } of filas) {
    if (detalles.has(id) || faltan.has(id)) continue;
    const v = porId.get(id);
    if (v) detalles.set(id, detalleDesdeCatalogo(v, precios[id]));
    else faltan.add(id);
  }
  return { detalles, faltan: [...faltan] };
}

/**
 * Las filas de la sede: cada prenda con sus cantidades sumadas (`sumarCantidades`). Una tienda muestra también lo que llegó a 0 —es el
 * estado SIN STOCK que se quiere ver, no un vacío—; el Taller, que no separa piso de almacén, solo lo que tiene. Ordenadas por referencia
 * y código.
 */
export function armarFilasStock(filas: FilaCantidadCruda[], detalles: ReadonlyMap<string, DetalleDeFila>): FilaStock[] {
  const cantidades = sumarCantidades(filas);
  const separaPisoAlmacen = [...cantidades.values()].some((c) => c.piso !== null);
  return Array.from(detalles.values(), (detalle) => ({ ...detalle, ...cantidades.get(detalle.varianteId)! }))
    .filter((f) => separaPisoAlmacen || f.total > 0)
    .sort((a, b) => a.referencia.localeCompare(b.referencia, "es") || (a.sku ?? "").localeCompare(b.sku ?? "", "es"));
}
