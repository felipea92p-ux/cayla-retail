import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";

// Historial de Producto (Sesión A3, 2026-09-15): la mitad de precio/categoría.
// `productos`/`variantes` no tienen `updated_at` ni ningún log — este archivo
// lee `retail.historial_producto_cambios`, un ledger append-only que se
// llena SOLO por trigger (20260915204541_historial_producto_cambios.sql), no
// desde ninguna pantalla. Los movimientos de stock del mismo producto se leen
// aparte, en `listarMovimientosProducto` (movimientos-v2.ts): son dos tablas
// con dos historias distintas, no una sola consulta.

export type CambioProducto = {
  id: string;
  creadoEn: string;
  entidad: "producto" | "variante";
  campo: "categoria_id" | "precio" | "estado";
  valorAnterior: string | null;
  valorNuevo: string | null;
  /** Solo cuando `campo === "categoria_id"`: el nombre, no el uuid crudo. */
  categoriaAnteriorNombre: string | null;
  categoriaNuevaNombre: string | null;
  varianteId: string | null;
  varianteSku: string | null;
  varianteTalla: string | null;
  varianteColor: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
};

type FilaRpc = {
  id: string;
  created_at: string;
  entidad: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  categoria_anterior_nombre: string | null;
  categoria_nueva_nombre: string | null;
  variante_id: string | null;
  variante_sku: string | null;
  variante_talla: string | null;
  variante_color: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
};

/** Todos los cambios de precio/categoría de un producto y sus variantes, más
 *  recientes primero. Sin paginar: es un volumen bajo por producto (un
 *  precio no cambia todos los días). */
export async function getCambiosProducto(productoId: string): Promise<CambioProducto[]> {
  const supabase = await createClient();
  // «Volumen bajo» por producto, pero un cambio de precio masivo escribe una fila POR VARIANTE: un modelo con muchas
  // tallas y colores pasa las 1.000 filas en pocos cambios y PostgREST cortaría los más viejos sin avisar. Por
  // páginas, en serie (ADR-0192), más recientes primero como la función, con `id` para que el orden sea único.
  const filas = exigir(
    await leerTodas(
      (desde, hasta) =>
        supabase
          .rpc("fn_historial_producto_cambios", { p_producto_id: productoId })
          .order("created_at", { ascending: false })
          .order("id")
          .range(desde, hasta),
      { enParalelo: 1 },
    ),
    "los cambios de precio y categoría del producto"
  );
  return (filas as FilaRpc[]).map((f) => ({
    id: f.id,
    creadoEn: f.created_at,
    entidad: f.entidad as CambioProducto["entidad"],
    campo: f.campo as CambioProducto["campo"],
    valorAnterior: f.valor_anterior,
    valorNuevo: f.valor_nuevo,
    categoriaAnteriorNombre: f.categoria_anterior_nombre,
    categoriaNuevaNombre: f.categoria_nueva_nombre,
    varianteId: f.variante_id,
    varianteSku: f.variante_sku,
    varianteTalla: f.variante_talla,
    varianteColor: f.variante_color,
    usuarioId: f.usuario_id,
    usuarioNombre: f.usuario_nombre,
  }));
}

export type ProductoResumen = {
  id: string;
  referencia: string;
  categoria: string | null;
  estado: string;
};

/** Lo mínimo para el encabezado del panel — no el catálogo completo (eso es
 *  `getCatalogo()` en catalogo-v2.ts, una fila por variante). */
export async function getProductoResumen(productoId: string): Promise<ProductoResumen | null> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.from("productos").select("id, referencia, estado, categoria:categorias ( nombre )").eq("id", productoId).limit(1),
    "el producto"
  );
  const fila = filas[0];
  if (!fila) return null;
  return { id: fila.id, referencia: fila.referencia, categoria: fila.categoria?.nombre ?? null, estado: fila.estado };
}
