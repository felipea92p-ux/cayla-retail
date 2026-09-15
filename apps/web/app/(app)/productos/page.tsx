import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";
import { ProductosNav } from "@/components/ProductosNav";
import { ProductosAgrupados } from "@/components/ProductosAgrupados";

// Fase UI 1 (2026-09-11): pantalla nueva, no una migración de
// `inventario/producto` (V1) — esa ruta es un formulario de alta que depende
// de `marca`, `foto_url` y `categorias.tallas_sugeridas` (ninguno existe en
// V2). Esta es solo lectura del catálogo V2: producto, categoría, variante
// (SKU/talla/color/precio/costo) y sus códigos de barra. Alta de producto
// queda para Fase 2 (requiere decidir con Felipe el flujo, no solo el CRUD).
//
// Fase UI 2 (2026-09-14): la tabla plana (una fila por variante) se vuelve
// ilegible con más de ~20 filas. `ProductosAgrupados` la reemplaza por el
// patrón de `trix/catalogo-vocabulario` (V1) — un producto, expandible a sus
// variantes — sin traer con él el stock que V1 mostraba ahí: en V2 eso es
// `/inventario`, a propósito separado de "qué existe".
//
// Fase 2 (2026-09-15): alta de producto con matriz talla×color, en
// `/productos/nuevo`. El candado real (solo Líder) vive en la RPC
// `crear_producto_con_variantes` — el `persona.rol === "lider"` de acá solo
// decide si el botón se MUESTRA.
export default async function ProductosPage() {
  const persona = await requirePersonaActualV2();
  const catalogo = await getCatalogo();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Catálogo</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Productos</h1>
        </div>
        {persona.rol === "lider" && (
          <Link
            href="/productos/nuevo"
            className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Nuevo producto
          </Link>
        )}
      </div>

      <ProductosNav />

      {catalogo.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay productos en el catálogo.</p>
      ) : (
        <ProductosAgrupados catalogo={catalogo} />
      )}
    </div>
  );
}
