import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Catálogo V2: `productos` + `variantes` + `categorias` + `colores` +
// `codigos_barras`. No es una edición de `catalogo.ts` (V1) — ese archivo
// depende de `stock_almacen`, `marca` y `foto_url`, ninguno de los cuales
// existe en el esquema V2 (más simple a propósito, ver
// `supabase/migrations/0002_esquema.sql`). `productos.stock_minimo` sí se
// sumó (20260915160000_productos_listado_filtros.sql, decisión de Felipe)
// como umbral de "stock bajo" en /productos — lo usan `listarProductos`/
// `getResumenProductos` más abajo, y se edita desde `ProductoForm.tsx`.
export type VarianteCatalogo = {
  varianteId: string;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`) — lo que lee la pistola. El `sku` es
   *  legado y las prendas del censo nacen sin él. */
  codigo: string | null;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  /** Foto de ESTA variante, por su color (20260917190000) — null si ese
   *  color todavía no tiene foto, o si la consulta no las trae
   *  (`getCatalogo()`, que no las necesita). El cliente cae a un tinte del
   *  color cuando falta, nunca a un ícono de "sin foto". */
  fotoUrl: string | null;
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
        `id, sku, codigo, talla, color_codigo, precio, costo, activo,
         producto:productos ( id, referencia, categoria:categorias ( nombre ) ),
         color:colores ( nombre, hex ),
         codigos_barras ( codigo )`
      )
      .order("sku"),
    "el catálogo"
  );

  return filas.map((v) => ({
    varianteId: v.id,
    sku: v.sku ?? "",
    codigo: v.codigo,
    talla: v.talla,
    color: v.color?.nombre ?? null,
    colorHex: v.color?.hex ?? null,
    fotoUrl: null,
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
  /** "reponer" = punto de reorden (20260916100000): demanda × tiempo de
   *  entrega + stock_minimo. Distinto de "bajo" — reponer suele encenderse
   *  antes, ya que el punto de reorden incluye stock_minimo como piso. */
  stock?: "sin_stock" | "bajo" | "reponer";
  /** Orden del catálogo (20260917180000) — null/undefined = por referencia,
   *  el de siempre. Solo `fn_productos` lo entiende; `fn_productos_resumen`
   *  no pagina, así que nunca le llega (ver `paramsFiltrosProductos`). */
  orden?: "precio_asc" | "precio_desc";
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
  /** Grilla ⇄ tabla (ADR-0077) — no es un filtro, no pasa por `fn_productos`. */
  vista?: string;
  orden?: string;
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
    stock:
      p.stock === "sin_stock" || p.stock === "bajo" || p.stock === "reponer" ? p.stock : undefined,
    orden: p.orden === "precio_asc" || p.orden === "precio_desc" ? p.orden : undefined,
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
  /** Ventas/día promedio de los últimos 30 días, todas las sedes (20260916100000). */
  demandaDiaria: number;
  /** Proxy factura→recepción, en días; 14 si nunca hubo una recepción con factura. */
  leadTimeDias: number;
  /** ceil(demandaDiaria × leadTimeDias) + stockMinimo. */
  puntoReorden: number;
  /** stockTotal <= puntoReorden y demandaDiaria > 0 — la señal "Pedir a proveedor". */
  reponerDeProveedor: boolean;
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
  reponerDeProveedor: number;
};

/** Los `p_*` que `fn_productos` y `fn_productos_resumen` comparten. Se
 *  omite la clave en vez de mandar `null`: los Args generados los tipan
 *  `string | undefined` (opcionales), no `string | null`. `orden` se excluye
 *  a propósito (como `stock`): `fn_productos_resumen` no lo acepta — no
 *  pagina, no hay nada que "ordenar". */
function paramsFiltrosProductos(filtros: Omit<FiltrosProductos, "stock" | "orden">) {
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
      ...(filtros.orden ? { p_orden: filtros.orden } : {}),
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
        demandaDiaria: Number(f.demanda_diaria),
        leadTimeDias: Number(f.lead_time_dias),
        puntoReorden: f.punto_reorden,
        reponerDeProveedor: f.reponer_de_proveedor,
        variantes: [],
      };
      porProducto.set(f.producto_id, p);
    }
    p.variantes.push({
      varianteId: f.variante_id,
      sku: f.sku,
      codigo: f.variante_codigo,
      talla: f.talla,
      color: f.color_nombre,
      colorHex: f.color_hex,
      fotoUrl: f.foto_url,
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
 *  menos `stock`/`orden`: esas dos cifras (stock bajo/sin stock) son lo que
 *  el resumen calcula, no algo que ya llega filtrado (igual que Movimientos
 *  no le pasa la categoría a su propio resumen), y "orden" no significa nada
 *  sin paginado. */
export async function getResumenProductos(filtros: Omit<FiltrosProductos, "stock" | "orden">): Promise<ResumenProductos> {
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
    reponerDeProveedor: Number(r?.reponer_de_proveedor ?? 0),
  };
}

/** Una variante dentro de la ficha de edición — a diferencia de
 *  `VarianteCatalogo`, trae `colorCodigo`/`codigo` (hacen falta para
 *  precargar el form) y no aplana el nombre del producto. */
export type VarianteDetalle = {
  id: string;
  colorCodigo: string | null;
  color: string | null;
  talla: string | null;
  sku: string;
  precio: number;
  costo: number;
  activo: boolean;
  codigo: string | null;
  codigosBarras: string[];
};

/** Una foto de la galería del producto (20260915224500). `id` ausente =
 *  recién subida en esta sesión de edición, todavía no tiene fila.
 *  `colorCodigo` (20260917190000): a qué color pertenece — null = sin
 *  color (accesorio, o foto general sin etiquetar). */
export type FotoProducto = {
  id: string | null;
  url: string;
  esPrincipal: boolean;
  colorCodigo: string | null;
};

export type ProductoDetalle = {
  id: string;
  categoriaId: string | null;
  referencia: string;
  descripcion: string | null;
  estado: "activo" | "descontinuado";
  codigo: string | null;
  /** Umbral de "stock bajo" en /productos (20260915160000). Null = sin umbral. */
  stockMinimo: number | null;
  /** Texto libre ("Verano 26"). Null = sin temporada (20260915224500). */
  temporada: string | null;
  /** Si es true, el producto puede venderse aunque el stock marque 0 (20260915224500). */
  permitirVentaSinStock: boolean;
  /** Ya en el orden de la galería (`orden` ascendente). */
  fotos: FotoProducto[];
  variantes: VarianteDetalle[];
};

/** El producto y sus variantes, para `/productos/[id]/editar`. `null` si no existe. */
export async function getProducto(id: string): Promise<ProductoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .select(
      `id, categoria_id, referencia, descripcion, estado, codigo, stock_minimo, temporada, permitir_venta_sin_stock,
       variantes ( id, color_codigo, talla, sku, precio, costo, activo, codigo,
         color:colores ( nombre ),
         codigos_barras ( codigo ) ),
       producto_fotos ( id, url, orden, es_principal, color_codigo )`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el producto: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    categoriaId: data.categoria_id,
    referencia: data.referencia,
    descripcion: data.descripcion,
    estado: data.estado as ProductoDetalle["estado"],
    codigo: data.codigo,
    stockMinimo: data.stock_minimo,
    temporada: data.temporada,
    permitirVentaSinStock: data.permitir_venta_sin_stock,
    fotos: [...(data.producto_fotos ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((f) => ({ id: f.id, url: f.url, esPrincipal: f.es_principal, colorCodigo: f.color_codigo })),
    variantes: (data.variantes ?? []).map((v) => ({
      id: v.id,
      colorCodigo: v.color_codigo,
      color: v.color?.nombre ?? null,
      talla: v.talla,
      sku: v.sku ?? "",
      precio: Number(v.precio),
      costo: Number(v.costo),
      activo: v.activo,
      codigo: v.codigo,
      codigosBarras: (v.codigos_barras ?? []).map((c) => c.codigo),
    })),
  };
}
