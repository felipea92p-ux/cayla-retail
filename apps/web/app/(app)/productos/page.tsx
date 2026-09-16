import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getSububicaciones } from "@/lib/sububicaciones";
import {
  filtrosProductosDesdeParams,
  paginaProductosDesdeParams,
  listarProductos,
  getResumenProductos,
  type ParamsProductosListado,
  type ResumenProductos,
} from "@/lib/catalogo-v2";
import { ProductosAgrupados } from "@/components/ProductosAgrupados";
import { FiltrosProductos } from "@/components/FiltrosProductos";
import { PaginacionPaginas } from "@/components/Paginacion";

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
// Fase UI 3 (2026-09-15): de filtrar/paginar TODO el catálogo en memoria del
// cliente (`getCatalogo()`) a filtros en la URL + Postgres
// (`fn_productos`/`fn_productos_resumen`), mismo patrón que Movimientos —
// ver `20260915160000_productos_listado_filtros.sql` para las decisiones
// (paginado por número de página, por qué el stock entra acá ahora).
// `getCatalogo()` sigue existiendo para quien necesite el catálogo entero
// sin filtrar (el escáner de Vender).
//
// Fase 2 (2026-09-15): alta de producto con matriz talla×color, en
// `/productos/nuevo` — RPC `crear_producto_con_variantes`, candado real de
// Líder ahí; `persona.rol === "lider"` de acá solo decide si el botón se
// MUESTRA. Editar un producto ya existente sigue en `ProductoForm`
// (`/productos/[id]/editar`): la matriz es para crear varias variantes de
// una sola vez, no tiene sentido para una que ya existe.
export default async function ProductosPage({ searchParams }: { searchParams: Promise<ParamsProductosListado> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const filtros = filtrosProductosDesdeParams(params);
  const pagina = paginaProductosDesdeParams(params);
  const supabase = await createClient();

  const [resultado, resumen, categorias, colores, sububicaciones] = await Promise.all([
    listarProductos(filtros, pagina),
    getResumenProductos(filtros),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("colores").select("codigo, nombre").eq("activo", true).order("nombre"),
    getSububicaciones(persona.ubicacionId),
  ]);

  const categoriasOpciones = exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }));
  const coloresOpciones = exigir(colores, "los colores").map((c) => ({ id: c.codigo, nombre: c.nombre }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Catálogo</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Productos</h1>
        </div>
        {persona.rol === "lider" && (
          <Link href="/productos/nuevo" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
            + Nuevo producto
          </Link>
        )}
      </div>

      <Resumen resumen={resumen} params={params} />

      <FiltrosProductos categorias={categoriasOpciones} colores={coloresOpciones} />

      <ProductosAgrupados
        productos={resultado.productos}
        ubicacionId={persona.ubicacionId}
        sububicaciones={sububicaciones}
        esLider={persona.rol === "lider"}
      />

      <PaginacionPaginas
        pagina={resultado.pagina}
        totalPaginas={resultado.totalPaginas}
        totalItems={resultado.totalProductos}
        params={{ ...params, pagina: undefined }}
        pathname="/productos"
        sustantivo={["producto", "productos"]}
      />
    </div>
  );
}

// Cuatro cifras de una consulta agregada (`fn_productos_resumen`), no del
// catálogo cargado en el cliente — con paginado, la página nunca es "todo el
// catálogo". "Stock bajo" y "sin stock" son también atajos: tocarlas aplica
// ese filtro, mismo criterio que "Vence esta semana" en Compras.
function Resumen({ resumen, params }: { resumen: ResumenProductos; params: ParamsProductosListado }) {
  function hrefConStock(stock: "sin_stock" | "bajo") {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina" && k !== "stock") p.set(k, v);
    p.set("stock", stock);
    return `/productos?${p.toString()}`;
  }

  return (
    <div className="card-cayla px-5 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="label-cayla text-[11px] text-tinta/65">Productos</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta">{resumen.totalProductos.toLocaleString("es-PE")}</dd>
        </div>
        <div>
          <dt className="label-cayla text-[11px] text-tinta/65">Variantes</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta">{resumen.totalVariantes.toLocaleString("es-PE")}</dd>
        </div>
        <Link href={hrefConStock("bajo")} className="group">
          <dt className="label-cayla text-[11px] text-tinta/65 group-hover:text-rojo">Stock bajo</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta group-hover:text-rojo">
            {resumen.stockBajo.toLocaleString("es-PE")}
          </dd>
        </Link>
        <Link href={hrefConStock("sin_stock")} className="group">
          <dt className="label-cayla text-[11px] text-tinta/65 group-hover:text-rojo">Sin stock</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta group-hover:text-rojo">
            {resumen.sinStock.toLocaleString("es-PE")}
          </dd>
        </Link>
      </dl>
    </div>
  );
}
