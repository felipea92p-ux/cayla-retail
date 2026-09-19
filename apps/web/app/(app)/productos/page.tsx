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
  getProductosPendientesAlta,
  getReposicionPorProveedor,
  type ParamsProductosListado,
  type ResumenProductos,
} from "@/lib/catalogo-v2";
import { ProductosAgrupados } from "@/components/ProductosAgrupados";
import { ProductosGrilla } from "@/components/ProductosGrilla";
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
  const vista = params.vista === "tabla" ? "tabla" : "grilla";
  const supabase = await createClient();

  // Grilla ⇄ tabla (ADR-0077) — mismo patrón que `hrefConStock` de `Resumen`
  // más abajo: reconstruye la URL con todos los filtros vigentes, solo
  // cambia `vista`. Grilla es el default, así que no ensucia la URL.
  function hrefConVista(v: "grilla" | "tabla") {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val && k !== "vista") p.set(k, val);
    if (v !== "grilla") p.set("vista", v);
    const qs = p.toString();
    return qs ? `/productos?${qs}` : "/productos";
  }

  const [resultado, resumen, categorias, colores, resMarcas, resProveedores, sububicaciones, pendientesAlta] = await Promise.all([
    listarProductos(filtros, pagina),
    getResumenProductos(filtros),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("nombre"),
    // Marcas y proveedores activos, para los filtros (ADR-0109).
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    getSububicaciones(persona.ubicacionId),
    persona.rol === "lider" ? getProductosPendientesAlta() : Promise.resolve([]),
  ]);

  // «A quién pedirle»: solo se calcula si hay algo por pedir (una consulta menos en el caso normal).
  const reposicion = resumen.reponerDeProveedor > 0 ? await getReposicionPorProveedor() : [];

  const categoriasOpciones = exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }));
  const coloresOpciones = exigir(colores, "los colores").map((c) => ({ id: c.codigo, nombre: c.nombre, hex: c.hex }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Catálogo</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Productos</h1>
          {vista === "grilla" && <Resumen resumen={resumen} params={params} compacto />}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5 rounded-lg bg-sand p-0.5">
            <Link
              href={hrefConVista("grilla")}
              aria-current={vista === "grilla" ? "page" : undefined}
              className={`label-cayla rounded-md px-3 py-2 text-[10.5px] transition-colors ${
                vista === "grilla" ? "bg-papel text-tinta" : "text-tinta/60 hover:text-tinta"
              }`}
            >
              Grilla
            </Link>
            <Link
              href={hrefConVista("tabla")}
              aria-current={vista === "tabla" ? "page" : undefined}
              className={`label-cayla rounded-md px-3 py-2 text-[10.5px] transition-colors ${
                vista === "tabla" ? "bg-papel text-tinta" : "text-tinta/60 hover:text-tinta"
              }`}
            >
              Tabla
            </Link>
          </div>
          {persona.rol === "lider" && (
            <Link href="/productos/nuevo" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
              + Nuevo producto
            </Link>
          )}
        </div>
      </div>

      {pendientesAlta.length > 0 && (
        <div className="card-cayla space-y-2 border-l-2 border-l-rojo p-4">
          <p className="text-sm font-semibold text-tinta">
            {pendientesAlta.length} {pendientesAlta.length === 1 ? "prenda dada de alta" : "prendas dadas de alta"} durante un conteo, pendiente
            {pendientesAlta.length === 1 ? "" : "s"} de revisar
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {pendientesAlta.map((p) => (
              <li key={p.id}>
                <Link href={`/productos/${p.id}/editar`} className="text-tinta underline underline-offset-2 hover:no-underline">
                  {p.referencia}
                </Link>
                {p.categoria && <span className="text-tinta/55"> · {p.categoria}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {vista === "tabla" && <Resumen resumen={resumen} params={params} />}

      {reposicion.length > 0 && (
        <div className="card-cayla p-4">
          <p className="label-cayla text-[11px] text-tinta/65">A quién pedirle</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {reposicion.map((r) => {
              const activo = params.proveedor === r.proveedorId && params.stock === "reponer";
              return (
                <li key={r.proveedorId}>
                  <Link
                    href={`/productos?stock=reponer&proveedor=${r.proveedorId}`}
                    aria-current={activo ? "true" : undefined}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      activo ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/80 hover:border-tinta/40"
                    }`}
                  >
                    {r.proveedor}
                    <span className="tabular-nums text-ambar-profundo">
                      {r.productos} {r.productos === 1 ? "producto" : "productos"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <FiltrosProductos
        categorias={categoriasOpciones}
        colores={coloresOpciones}
        marcas={exigir(resMarcas, "las marcas")}
        proveedores={exigir(resProveedores, "los proveedores")}
        compacto={vista === "grilla"}
      />

      {vista === "grilla" ? (
        <ProductosGrilla
          productos={resultado.productos}
          ubicacionId={persona.ubicacionId}
          sububicaciones={sububicaciones}
          esLider={persona.rol === "lider"}
        />
      ) : (
        <ProductosAgrupados
          productos={resultado.productos}
          ubicacionId={persona.ubicacionId}
          sububicaciones={sububicaciones}
          esLider={persona.rol === "lider"}
        />
      )}

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
//
// `compacto` (2026-09-17, pedido de Felipe): en la Grilla esto deja de ser
// una tarjeta propia y pasa a una línea bajo "Productos" — y solo dice lo
// que hace falta accionar (pedir/stock bajo/sin stock quedan mudos en 0, no
// en gris): la ropa no debería competir con cinco cifras para hacerse ver.
// La Tabla sigue con la tarjeta completa, sin tocar.
function Resumen({ resumen, params, compacto = false }: { resumen: ResumenProductos; params: ParamsProductosListado; compacto?: boolean }) {
  function hrefConStock(stock: "sin_stock" | "bajo" | "reponer") {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina" && k !== "stock") p.set(k, v);
    p.set("stock", stock);
    return `/productos?${p.toString()}`;
  }

  if (compacto) {
    return (
      <p className="mt-1 text-xs text-tinta/55">
        {resumen.totalProductos.toLocaleString("es-PE")} productos · {resumen.totalVariantes.toLocaleString("es-PE")} variantes
        {resumen.reponerDeProveedor > 0 && (
          <>
            {" · "}
            <Link href={hrefConStock("reponer")} className="text-ambar-profundo hover:underline">
              {resumen.reponerDeProveedor.toLocaleString("es-PE")} para pedir
            </Link>
          </>
        )}
        {resumen.stockBajo > 0 && (
          <>
            {" · "}
            <Link href={hrefConStock("bajo")} className="text-ambar-profundo hover:underline">
              {resumen.stockBajo.toLocaleString("es-PE")} con stock bajo
            </Link>
          </>
        )}
        {resumen.sinStock > 0 && (
          <>
            {" · "}
            <Link href={hrefConStock("sin_stock")} className="text-rojo hover:underline">
              {resumen.sinStock.toLocaleString("es-PE")} sin stock
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="card-cayla px-5 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        <div>
          <dt className="label-cayla text-[11px] text-tinta/65">Productos</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta">{resumen.totalProductos.toLocaleString("es-PE")}</dd>
        </div>
        <div>
          <dt className="label-cayla text-[11px] text-tinta/65">Variantes</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta">{resumen.totalVariantes.toLocaleString("es-PE")}</dd>
        </div>
        <Link href={hrefConStock("reponer")} className="group">
          <dt className="label-cayla text-[11px] text-tinta/65 group-hover:text-ambar">Pedir a proveedor</dt>
          <dd className="font-display mt-0.5 text-2xl tabular-nums text-tinta group-hover:text-ambar">
            {resumen.reponerDeProveedor.toLocaleString("es-PE")}
          </dd>
        </Link>
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
