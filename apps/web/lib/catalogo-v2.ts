import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Catálogo V2: `productos` + `variantes` + `categorias` + `colores` +
// `codigos_barras`. No es una edición de `catalogo.ts` (V1) — ese archivo
// depende de `stock_almacen`, `marca`, `foto_url` y `stock_minimo`, ninguno
// de los cuales existe en el esquema V2 (más simple a propósito, ver
// `supabase/migrations/0002_esquema.sql`).
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

export type ProductoDetalle = {
  id: string;
  categoriaId: string | null;
  referencia: string;
  descripcion: string | null;
  estado: "activo" | "descontinuado";
  codigo: string | null;
  variantes: VarianteDetalle[];
};

/** El producto y sus variantes, para `/productos/[id]/editar`. `null` si no existe. */
export async function getProducto(id: string): Promise<ProductoDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .select(
      `id, categoria_id, referencia, descripcion, estado, codigo,
       variantes ( id, color_codigo, talla, sku, precio, costo, activo, codigo,
         color:colores ( nombre ),
         codigos_barras ( codigo ) )`
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
    variantes: (data.variantes ?? []).map((v) => ({
      id: v.id,
      colorCodigo: v.color_codigo,
      color: v.color?.nombre ?? null,
      talla: v.talla,
      sku: v.sku,
      precio: Number(v.precio),
      costo: Number(v.costo),
      activo: v.activo,
      codigo: v.codigo,
      codigosBarras: (v.codigos_barras ?? []).map((c) => c.codigo),
    })),
  };
}
