import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Catálogo V2: `productos` + `variantes` + `categorias` + `colores` +
// `codigos_barras`. No es una edición de `catalogo.ts` (V1) — ese archivo
// depende de `stock_almacen`, `marca` y `foto_url`, ninguno de los cuales
// existe en el esquema V2 (más simple a propósito, ver
// `supabase/migrations/0002_esquema.sql`). `productos.stock_minimo` sí se
// sumó (20260915160000_productos_listado_filtros.sql, decisión de Felipe)
// pero solo lo usa `listarProductos`/`getResumenProductos` más abajo — es
// un umbral para "stock bajo" en /productos, no parte de este catálogo base.
export type VarianteCatalogo = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  precio: number;
  costo: number;
  activo: boolean;
  productoId: string;
  referencia: string;
  categoria: string | null;
  codigosBarras: string[];
};

/** Todo el catálogo activo, para la pantalla de Productos. */
export async function getCatalogo(): Promise<VarianteCatalogo[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("variantes")
      .select(
        `id, sku, talla, color_codigo, precio, costo, activo,
         producto:productos ( id, referencia, categoria:categorias ( nombre ) ),
         color:colores ( nombre, hex ),
         codigos_barras ( codigo )`
      )
      .order("sku"),
    "el catálogo"
  );

  return filas.map((v) => ({
    varianteId: v.id,
    sku: v.sku,
    talla: v.talla,
    color: v.color?.nombre ?? null,
    colorHex: v.color?.hex ?? null,
    precio: Number(v.precio),
    costo: Number(v.costo),
    activo: v.activo,
    productoId: v.producto?.id ?? "",
    referencia: v.producto?.referencia ?? "(sin referencia)",
    categoria: v.producto?.categoria?.nombre ?? null,
    codigosBarras: (v.codigos_barras ?? []).map((c) => c.codigo),
  }));
}

// ============================================================================
// Listado filtrado y paginado de /productos (2026-09-15).
//
// `getCatalogo()` arriba sigue existiendo tal cual — trae TODO sin filtrar,
// y lo siguen usando flujos que de verdad necesitan el catálogo entero (el
// escáner de Vender). Esto es aparte: filtros en la URL, resueltos en
// Postgres (`fn_productos`/`fn_productos_resumen`,
// `20260915160000_productos_listado_filtros.sql`), paginado por PRODUCTO
// (no por fila de variante) y por número de página — no cursor, decisión de
// Felipe documentada en la migración: el catálogo no crece como un ledger.
// ============================================================================

export type FiltrosProductos = {
  busqueda?: string;
  categoriaId?: string;
  colorCodigo?: string;
  estado?: "activo" | "descontinuado";
  precioMin?: number;
  precioMax?: number;
  stock?: "sin_stock" | "bajo";
};

/** Parámetros de URL de /productos (ver `FiltrosProductos.tsx`). */
export type ParamsProductosListado = {
  q?: string;
  cat?: string;
  color?: string;
  estado?: string;
  precioMin?: string;
  precioMax?: string;
  stock?: string;
  pagina?: string;
};

export const PRODUCTOS_POR_PAGINA = 24;

const esUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const esNumeroPositivo = (v?: string) => !!v && /^\d+(\.\d+)?$/.test(v);

/** Traduce la URL a filtros, descartando cualquier valor que no calce con su forma. */
export function filtrosProductosDesdeParams(p: ParamsProductosListado): FiltrosProductos {
  return {
    busqueda: p.q?.trim() || undefined,
    categoriaId: esUuid(p.cat) ? p.cat : undefined,
    colorCodigo: p.color?.trim() || undefined,
    estado: p.estado === "activo" || p.estado === "descontinuado" ? p.estado : undefined,
    precioMin: esNumeroPositivo(p.precioMin) ? Number(p.precioMin) : undefined,
    precioMax: esNumeroPositivo(p.precioMax) ? Number(p.precioMax) : undefined,
    stock: p.stock === "sin_stock" || p.stock === "bajo" ? p.stock : undefined,
  };
}

export function paginaProductosDesdeParams(p: ParamsProductosListado): number {
  const n = Number(p.pagina);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export type ProductoListado = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  categoriaId: string | null;
  categoria: string | null;
  estado: string;
  stockMinimo: number | null;
  stockTotal: number;
  variantes: VarianteCatalogo[];
};

export type PaginaProductos = {
  productos: ProductoListado[];
  totalProductos: number;
  totalPaginas: number;
  pagina: number;
};

export type ResumenProductos = {
  totalProductos: number;
  totalVariantes: number;
  stockBajo: number;
  sinStock: number;
};

/** Los `p_*` que `fn_productos` y `fn_productos_resumen` comparten. Se
 *  omite la clave en vez de mandar `null`: los Args generados los tipan
 *  `string | undefined` (opcionales), no `string | null`. */
function paramsFiltrosProductos(filtros: Omit<FiltrosProductos, "stock">) {
  return {
    ...(filtros.busqueda ? { p_busqueda: filtros.busqueda } : {}),
    ...(filtros.categoriaId ? { p_categoria_id: filtros.categoriaId } : {}),
    ...(filtros.colorCodigo ? { p_color_codigo: filtros.colorCodigo } : {}),
    ...(filtros.estado ? { p_estado: filtros.estado } : {}),
    ...(filtros.precioMin != null ? { p_precio_min: filtros.precioMin } : {}),
    ...(filtros.precioMax != null ? { p_precio_max: filtros.precioMax } : {}),
  };
}

/** Catálogo filtrado y paginado (por producto) server-side, para /productos. */
export async function listarProductos(filtros: FiltrosProductos, pagina: number): Promise<PaginaProductos> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("fn_productos", {
      ...paramsFiltrosProductos(filtros),
      ...(filtros.stock ? { p_stock: filtros.stock } : {}),
      p_pagina: pagina,
      p_por_pagina: PRODUCTOS_POR_PAGINA,
    }),
    "el catálogo de productos"
  );

  const porProducto = new Map<string, ProductoListado>();
  let totalProductos = 0;
  for (const f of filas) {
    totalProductos = f.total_productos;
    let p = porProducto.get(f.producto_id);
    if (!p) {
      p = {
        productoId: f.producto_id,
        referencia: f.referencia,
        codigo: f.codigo,
        categoriaId: f.categoria_id,
        categoria: f.categoria_nombre,
        estado: f.estado,
        stockMinimo: f.stock_minimo,
        stockTotal: f.stock_total,
        variantes: [],
      };
      porProducto.set(f.producto_id, p);
    }
    p.variantes.push({
      varianteId: f.variante_id,
      sku: f.sku,
      talla: f.talla,
      color: f.color_nombre,
      colorHex: f.color_hex,
      precio: Number(f.precio),
      costo: Number(f.costo),
      activo: f.activo,
      productoId: f.producto_id,
      referencia: f.referencia,
      categoria: f.categoria_nombre,
      codigosBarras: f.codigos_barras ?? [],
    });
  }

  return {
    productos: [...porProducto.values()],
    totalProductos,
    totalPaginas: Math.max(1, Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA)),
    pagina,
  };
}

/** Tarjetas de resumen de /productos — mismos filtros que `listarProductos`
 *  menos `stock`: esas dos cifras (stock bajo/sin stock) son lo que el
 *  resumen calcula, no algo que ya llega filtrado (igual que Movimientos no
 *  le pasa la categoría a su propio resumen). */
export async function getResumenProductos(filtros: Omit<FiltrosProductos, "stock">): Promise<ResumenProductos> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("fn_productos_resumen", paramsFiltrosProductos(filtros)),
    "el resumen del catálogo"
  );
  const r = filas[0];
  return {
    totalProductos: Number(r?.total_productos ?? 0),
    totalVariantes: Number(r?.total_variantes ?? 0),
    stockBajo: Number(r?.stock_bajo ?? 0),
    sinStock: Number(r?.sin_stock ?? 0),
  };
}
