import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import {
  cambioVisible,
  etiquetaCampo,
  nombresPorBuscar,
  textoValorCambio,
  type NombresHistorial,
} from "@/lib/historial-producto-reglas";

// Historial de Producto (Sesión A3, 2026-09-15): la mitad de precio/categoría.
// `productos`/`variantes` no tienen `updated_at` ni ningún log — este archivo
// lee `retail.historial_producto_cambios`, un ledger append-only que se
// llena SOLO por trigger (20260915204541_historial_producto_cambios.sql), no
// desde ninguna pantalla. Los movimientos de stock del mismo producto se leen
// aparte, en `listarMovimientosProducto` (movimientos-v2.ts): son dos tablas
// con dos historias distintas, no una sola consulta.
//
// Desde ADR-0246 (2026-09-26) el ledger también recibe la temporada de la prenda y la de cada color; ya recibía marca,
// proveedor y costo. Cómo se dice cada campo vive en `historial-producto-reglas.ts` (una sola tabla); aquí se buscan los
// nombres que hacen falta (temporada, color, marca, proveedor) y la fila llega al panel ya dicha.

export type CambioProducto = {
  id: string;
  creadoEn: string;
  entidad: "producto" | "variante";
  /** El `campo` tal cual lo escribió la base (`precio`, `temporada`, `temporada:NEG`…). */
  campo: string;
  /** «Precio», «Temporada · Marfil»… (`etiquetaCampo`). */
  etiqueta: string;
  /** Los dos lados del cambio, ya en palabras de tienda (`textoValorCambio`). */
  textoAnterior: string;
  textoNuevo: string;
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Los nombres que necesitan estas filas, y solo esos. Tolerante: si una lectura falla (o la lista de temporadas todavía
 * no existe en esta base), la fila se pinta con la clave o con «una marca que ya no está», nunca tumba el historial.
 */
async function nombresParaCambios(supabase: Supabase, filas: readonly FilaRpc[]): Promise<NombresHistorial> {
  const falta = nombresPorBuscar(filas);
  const vacio = Promise.resolve({ data: null, error: null });
  const [resTemporadas, resColores, resTallas, resMarcas, resProveedores] = await Promise.all([
    falta.temporadas ? supabase.rpc("fn_temporadas") : vacio,
    falta.colores.length > 0 ? supabase.from("colores").select("codigo, nombre").in("codigo", falta.colores) : vacio,
    // Solo las filas `talla_id` de ADR-0258 (anotaban el uuid): se busca su valor para no mostrar nunca un uuid.
    falta.tallas.length > 0 ? supabase.from("tallas").select("id, valor").in("id", falta.tallas) : vacio,
    falta.marcas.length > 0 ? supabase.from("marcas").select("id, nombre").in("id", falta.marcas) : vacio,
    falta.proveedores.length > 0 ? supabase.from("proveedores").select("id, nombre").in("id", falta.proveedores) : vacio,
  ]);
  const mapa = <T,>(res: { data: T[] | null; error: unknown }, par: (f: T) => [string, string]) =>
    new Map(res.error || !res.data ? [] : res.data.map(par));
  return {
    temporadas: mapa(resTemporadas as { data: { clave: string; nombre: string }[] | null; error: unknown }, (t) => [t.clave, t.nombre]),
    colores: mapa(resColores as { data: { codigo: string; nombre: string }[] | null; error: unknown }, (c) => [c.codigo, c.nombre]),
    tallas: mapa(resTallas as { data: { id: string; valor: string }[] | null; error: unknown }, (t) => [t.id, t.valor]),
    marcas: mapa(resMarcas as { data: { id: string; nombre: string }[] | null; error: unknown }, (m) => [m.id, m.nombre]),
    proveedores: mapa(resProveedores as { data: { id: string; nombre: string }[] | null; error: unknown }, (p) => [p.id, p.nombre]),
  };
}

/** Todos los cambios de un producto y sus variantes (precio, categoría, estado, marca, proveedor, temporada…), más
 *  recientes primero. Sin paginar: es un volumen bajo por producto (un precio no cambia todos los días).
 *  `verCosto`: la cuenta ve el dinero de compras (`puede(persona, "verDineroCompras")`); sin eso, los cambios de costo
 *  no se entregan. */
export async function getCambiosProducto(productoId: string, { verCosto = false }: { verCosto?: boolean } = {}): Promise<CambioProducto[]> {
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
  const visibles = (filas as FilaRpc[]).filter((f) => cambioVisible(f.campo, verCosto));
  const nombres = await nombresParaCambios(supabase, visibles);
  return visibles.map((f) => ({
    id: f.id,
    creadoEn: f.created_at,
    entidad: f.entidad as CambioProducto["entidad"],
    campo: f.campo,
    etiqueta: etiquetaCampo(f.campo, nombres),
    textoAnterior: textoValorCambio(f.campo, f.valor_anterior, f.categoria_anterior_nombre, nombres),
    textoNuevo: textoValorCambio(f.campo, f.valor_nuevo, f.categoria_nueva_nombre, nombres),
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
