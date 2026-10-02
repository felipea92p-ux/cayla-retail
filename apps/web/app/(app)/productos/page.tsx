import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronDown, LayoutGrid, Rows3 } from "lucide-react";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  filtrosProductosDesdeParams,
  paginaProductosDesdeParams,
  listarProductos,
  getResumenProductos,
  getReposicionPorProveedor,
  getExistenciasProductos,
  getSinTemporadaResumen,
  getPreciosExtremos,
  type ParamsProductosListado,
} from "@/lib/catalogo-v2";
import { ProductosTabla } from "@/components/ProductosTabla";
import { ProductosGrilla } from "@/components/ProductosGrilla";
import { FiltrosProductos } from "@/components/FiltrosProductos";
import { PaginacionPaginas } from "@/components/Paginacion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AQuienPedirle } from "@/components/AQuienPedirle";
import { Ayuda } from "@/components/Ayuda";
import { EXPLICACION_STOCK_TOTAL, mensajeSinResultados } from "@/lib/productos-stock";
import { COOKIE_TAMANO_GRILLA, leerTamanoGrilla } from "@/lib/tamano-grilla";
import { limitesRedondeados } from "@/lib/productos-filtro-precio";

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
// 2026-09-28 (ADR-0254): `ProductosAgrupados` pasa a `ProductosTabla` (planilla con foto, colores, margen y
// ficha de variantes, tarjetas en el celular), la cabecera es la de Ventas (`EncabezadoPagina`) y los filtros
// son los plegables de la Grilla en las dos vistas.
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
// Líder o terminal administrativa ahí (ADR-0160); `puede(persona, "editarCatalogo")` de acá solo decide si el botón se
// MUESTRA. Editar un producto ya existente sigue en `ProductoForm`
// (`/productos/[id]/editar`): la matriz es para crear varias variantes de
// una sola vez, no tiene sentido para una que ya existe.
export default async function ProductosPage({ searchParams }: { searchParams: Promise<ParamsProductosListado> }) {
  const persona = await exigirModulo("productos"); // ADR-0161: URL directa sin el módulo en su rol → «Sin acceso»
  const params = await searchParams;
  const filtros = filtrosProductosDesdeParams(params);
  const pagina = paginaProductosDesdeParams(params);
  const vista = params.vista === "tabla" ? "tabla" : "grilla";
  // El tamaño de las tarjetas que esta máquina dejó la última vez (Felipe, 2026-09-29): cookie leída acá para que la primera
  // pintura ya salga con las columnas correctas (ver `lib/tamano-grilla.ts`).
  const tamanoGrilla = leerTamanoGrilla((await cookies()).get(COOKIE_TAMANO_GRILLA)?.value);
  const supabase = await createClient();

  // Grilla ⇄ tabla (ADR-0077): reconstruye la URL con todos los filtros vigentes, solo
  // cambia `vista`. Grilla es el default, así que no ensucia la URL.
  function hrefConVista(v: "grilla" | "tabla") {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val && k !== "vista") p.set(k, val);
    if (v !== "grilla") p.set("vista", v);
    const qs = p.toString();
    return qs ? `/productos?${qs}` : "/productos";
  }

  const editaCatalogo = puede(persona, "editarCatalogo");
  // ADR-0246 + ADR-0161: el aviso «N prendas sin temporada · Completar» lleva a Atributos ▸ Temporadas, que se abre con el
  // módulo «Categorías, marcas y atributos». `editarCatalogo` también sale de ver Productos completo, así que el permiso
  // solo no basta: sin el módulo, «Completar» caería en «Sin acceso». A quien no puede completarlas no se le muestra.
  const completaTemporadas = editaCatalogo && veModulo(persona, "atributos");
  const [resultado, resumen, categorias, colores, resMarcas, resProveedores, sinTemporada, precios] = await Promise.all([
    listarProductos(filtros, pagina),
    getResumenProductos(filtros),
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("nombre"),
    // Marcas y proveedores activos, para los filtros (ADR-0109).
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    // ADR-0246: solo a quien puede completarlas en la pestaña. `null` si no se pudo saber (SQL sin pegar): no se muestra nada.
    completaTemporadas ? getSinTemporadaResumen() : Promise.resolve(null),
    // Los límites del filtro de precio, de los precios reales (no el S/ 999 de antes). `null` si no se pudo: solo cajas.
    getPreciosExtremos(filtros).catch(() => null),
  ]);

  // «A quién pedirle»: solo se calcula si hay algo por pedir (una consulta menos en el caso normal). Y lo de la sede elegida
  // arriba para cada producto de esta página (ADR-0270): la misma cifra que Existencias. Las dos después de la lista, a la vez.
  // Y si la lista de activas sale vacía, cuántas descontinuadas sí calzan (solo entonces se pregunta; si falla, no se avisa).
  const preguntarDescontinuadas = resultado.totalProductos === 0 && filtros.estado === "activo" && !filtros.stock;
  const [reposicion, existencias, descontinuadas] = await Promise.all([
    resumen.reponerDeProveedor > 0 ? getReposicionPorProveedor(filtros) : Promise.resolve([]),
    getExistenciasProductos(
      resultado.productos.map((p) => p.productoId),
      persona.ubicacionId
    ),
    preguntarDescontinuadas
      ? getResumenProductos({ ...filtros, estado: "descontinuado" }).then((r) => r.totalProductos, () => 0)
      : Promise.resolve(0),
  ]);

  const categoriasOpciones = exigir(categorias, "las categorías").map((c) => ({ id: c.id, nombre: c.nombre }));
  const coloresOpciones = exigir(colores, "los colores").map((c) => ({ id: c.codigo, nombre: c.nombre, hex: c.hex }));

  const botonVista = (v: "grilla" | "tabla", Icono: typeof LayoutGrid, texto: string) => (
    <Link
      href={hrefConVista(v)}
      aria-current={vista === v ? "page" : undefined}
      className={`label-cayla inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[10.5px] transition-colors ${
        vista === v ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:text-tinta"
      }`}
    >
      <Icono aria-hidden className="h-3.5 w-3.5" />
      {texto}
    </Link>
  );

  return (
    <div className="space-y-6">
      {/* La cabecera de Ventas e Inventario (ADR-0220), pedida por Felipe para Productos el 2026-09-28 (ADR-0254). */}
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Productos"
        subtitulo={
          // Una frase corta y el «!» con el resto (Felipe, 2026-09-29): el párrafo de cinco líneas de antes explicaba cada cifra
          // de la pantalla y nadie lo leía completo. Lo mismo hacen Marcas, Categorías y Atributos.
          <>
            Cada prenda del catálogo con sus colores, tallas, precios y cuántas hay en tu sede.
            <Ayuda titulo="Productos">
              <span className="block">
                Aquí está todo el catálogo. Desde aquí creas una prenda nueva, corriges sus datos, la descontinúas o imprimes sus etiquetas.
              </span>
              <span className="mt-2 block">{EXPLICACION_STOCK_TOTAL}</span>
              <span className="mt-2 block">
                El detalle por talla y sede está en{" "}
                <Link href="/inventario" className="underline underline-offset-2 hover:no-underline">
                  Existencias
                </Link>
                .
              </span>
            </Ayuda>
          </>
        }
        acciones={
          <>
            <div className="flex gap-0.5 rounded-lg bg-sand p-0.5" role="group" aria-label="Cómo ver el catálogo">
              {botonVista("grilla", LayoutGrid, "Grilla")}
              {botonVista("tabla", Rows3, "Tabla")}
            </div>
            {editaCatalogo && (
              <Link href="/productos/nuevo" className="btn-cayla btn-primario">
                + Nuevo producto
              </Link>
            )}
          </>
        }
      />


      {sinTemporada && sinTemporada.prendas > 0 && (
        // ADR-0246: discreto (nota en hueso, no borde rojo): es trabajo de carga, no algo del mostrador. El porqué va
        // plegado; «Completar» queda fuera del <summary> para no anidar un enlace dentro de un botón.
        <div className="nota-cayla flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <details className="group min-w-0 flex-1">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <strong>
                {sinTemporada.prendas.toLocaleString("es-PE")} {sinTemporada.prendas === 1 ? "prenda sin temporada" : "prendas sin temporada"}
              </strong>
              <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1">
              Sin temporada, Frescura no las compara con las de su misma estación ni avisa cuando pasan a temporada pasada. En Atributos ▸
              Temporadas se completan de a varias; y si le pones temporada a su categoría, la heredan todas las que no tienen la suya.
            </p>
          </details>
          {/* `desde=productos`: la vista de destino muestra «← Productos» (Atributos está en el menú y no la lleva siempre). */}
          <Link href="/productos/atributos?tipo=temporadas&vista=completar&desde=productos" className="btn-cayla btn-enlace text-[13px]">
            Completar
          </Link>
        </div>
      )}

      {reposicion.length > 0 && (
        <AQuienPedirle
          reposicion={reposicion}
          proveedorId={params.stock === "reponer" ? params.proveedor : undefined}
        />
      )}

      <FiltrosProductos
        categorias={categoriasOpciones}
        colores={coloresOpciones}
        marcas={exigir(resMarcas, "las marcas")}
        proveedores={exigir(resProveedores, "los proveedores")}
        totalProductos={resultado.totalProductos}
        limitesPrecio={limitesRedondeados(precios)}
      />

      {/* `data-resultados`: se atenúa mientras el buscador espera a la base (useBusquedaEnUrl). */}
      <div data-resultados className="space-y-6">
        {vista === "grilla" ? (
          <ProductosGrilla
            productos={resultado.productos}
            existencias={existencias}
            veExistencias={veModulo(persona, "existencias")}
            ubicacionId={persona.ubicacionId}
            sede={persona.ubicacionEtiqueta}
            puedeEliminar={persona.rol === "lider"}
            mensajeVacio={mensajeSinResultados(filtros, { descontinuadas })}
            tamanoInicial={tamanoGrilla}
          />
        ) : (
          <ProductosTabla
            productos={resultado.productos}
            existencias={existencias}
            ubicacionId={persona.ubicacionId}
            sede={persona.ubicacionEtiqueta}
            puedeEditar={editaCatalogo}
            veExistencias={veModulo(persona, "existencias")}
            puedeEliminar={persona.rol === "lider"}
            veDinero={puede(persona, "verDineroCompras")}
            mensajeVacio={mensajeSinResultados(filtros, { descontinuadas })}
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
    </div>
  );
}
