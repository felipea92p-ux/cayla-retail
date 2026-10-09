import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronDown, LayoutGrid, Rows3, SignpostBig } from "lucide-react";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  filtrosProductosDesdeParams,
  conSede,
  paginaProductosDesdeParams,
  listarProductos,
  getExistenciasProductos,
  getSinTemporadaResumen,
  getFacetasProductos,
  getTemporadasCatalogo,
  type ParamsProductosListado,
} from "@/lib/catalogo-v2";
import { ProductosTabla } from "@/components/ProductosTabla";
import { ProductosGrilla } from "@/components/ProductosGrilla";
import { SelectorTamanoGrilla } from "@/components/SelectorTamanoGrilla";
import { FiltrosProductos } from "@/components/FiltrosProductos";
import { PaginacionPaginas } from "@/components/Paginacion";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { Ayuda } from "@/components/Ayuda";
import { EXPLICACION_STOCK_TOTAL, mensajeSinResultados } from "@/lib/productos-stock";
import { COOKIE_TAMANO_GRILLA, leerTamanoGrilla } from "@/lib/tamano-grilla";
import { limitesRedondeados } from "@/lib/productos-filtro-precio";
import { COOKIE_PANEL_FILTROS, leerPanelFiltros } from "@/lib/panel-filtros";
import { compararTallas } from "@/lib/tallas";
import { BotonEnlace } from "@/components/ui/campos";
import { urlRotulos } from "@/lib/rotulos-reglas";

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
// (`fn_productos`/`fn_productos_resumen`; desde 2026-10-02 `fn_productos_listado`/`fn_productos_facetas`, ADR-0308), mismo patrón que Movimientos —
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
  // «Hay en …» y «Sin stock en …» miran la sede elegida arriba; en CAYLA Global no hay una (ADR-0275) y no se aplican.
  const enSede = persona.vista !== "global";
  const filtros = conSede(filtrosProductosDesdeParams(params), enSede ? persona.ubicacionId : null);
  const pagina = paginaProductosDesdeParams(params);
  const vista = params.vista === "tabla" ? "tabla" : "grilla";
  // El tamaño de las tarjetas que esta máquina dejó la última vez (Felipe, 2026-09-29): cookie leída acá para que la primera
  // pintura ya salga con las columnas correctas (ver `lib/tamano-grilla.ts`).
  const galletas = await cookies();
  const tamanoGrilla = leerTamanoGrilla(galletas.get(COOKIE_TAMANO_GRILLA)?.value);
  // Si el panel de filtros nace abierto o cerrado en este equipo (Felipe, 2026-10-02: abierto, salvo que aquí se cerró).
  const panelFiltros = leerPanelFiltros(galletas.get(COOKIE_PANEL_FILTROS)?.value);
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
  // «Eliminar» en la tarjeta y en la tabla (ADR-0252, act. 2026-10-03): quien edita el catálogo, igual que la base
  // (`fn_puede_editar_catalogo`). Antes, solo Líder: la cuenta de almacén creaba productos y no podía deshacer un error.
  // ADR-0246 + ADR-0161: el aviso «N prendas sin temporada · Completar» lleva a Atributos ▸ Temporadas, que se abre con el
  // módulo «Categorías, marcas y atributos». `editarCatalogo` también sale de ver Productos completo, así que el permiso
  // solo no basta: sin el módulo, «Completar» caería en «Sin acceso». A quien no puede completarlas no se le muestra.
  const completaTemporadas = editaCatalogo && veModulo(persona, "atributos");
  const [resultado, facetas, categorias, colores, resMarcas, resProveedores, sinTemporada, resTallas, temporadas] = await Promise.all([
    listarProductos(filtros, pagina),
    // Cuántas hay en cada opción, el rango real del precio y sus tramos (ADR-0308). `null` si falla: opciones sin número.
    getFacetasProductos(filtros),
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("colores").select("codigo, nombre, hex, familia_color, tipo").eq("activo", true).order("nombre"),
    // Marcas y proveedores activos, para los filtros (ADR-0109).
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    // ADR-0246: solo a quien puede completarlas en la pestaña. `null` si no se pudo saber (SQL sin pegar): no se muestra nada.
    completaTemporadas ? getSinTemporadaResumen() : Promise.resolve(null),
    supabase.from("tallas").select("id, valor").eq("activo", true),
    // La lista cerrada de temporadas, para su filtro. `null` si no se pudo: la píldora no aparece, el resto sigue.
    getTemporadasCatalogo().catch(() => null),
  ]);

  // Lo de la sede elegida arriba para cada producto de esta página (ADR-0270): la misma cifra que Existencias. Va después de la
  // lista. «A quién pedirle» se quitó el 2026-10-07 (Felipe): repetía Disponibilidad ▸ «Pedir a proveedor» + Proveedor.
  // Una página que ya no existe (se descontinuó lo único que había en la 2, se volvió con «← Productos» a una página vieja):
  // a la primera, con los mismos filtros. Sin esto la pantalla decía «0 productos», escondía la paginación y avisaba de
  // descontinuadas aunque hubiera activas en la página 1.
  if (resultado.productos.length === 0 && pagina > 1) {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val && k !== "pagina") p.set(k, val);
    redirect(p.size > 0 ? `/productos?${p.toString()}` : "/productos");
  }

  // Si la lista de activas sale vacía, cuántas descontinuadas sí calzan: ya lo trae el conteo de «Estado» (con los demás
  // filtros puestos). Sin conteos, no se avisa.
  const descontinuadas =
    resultado.totalProductos === 0 && filtros.estado === "activo" ? (facetas?.facetas.estado?.descontinuado ?? 0) : 0;
  const existencias = await getExistenciasProductos(
    resultado.productos.map((p) => p.productoId),
    persona.ubicacionId
  );

  const categoriasLeidas = exigir(categorias, "las categorías");
  const categoriasOpciones = categoriasLeidas.map((c) => ({ id: c.id, nombre: c.nombre }));
  // Cada producto lleva el prefijo y la familia de su categoría (de la misma lectura de arriba, sin otra consulta): de ahí sale el
  // ícono de su miniatura cuando no tiene foto (ADR-0333). Una categoría desactivada no está en la lectura: esa prenda dibuja la percha.
  const categoriaPorId = new Map(categoriasLeidas.map((c) => [c.id, c] as const));
  const productos = resultado.productos.map((p) => {
    const c = p.categoriaId ? categoriaPorId.get(p.categoriaId) : undefined;
    return c ? { ...p, categoriaPrefijo: c.prefijo, categoriaFamilia: c.familia } : p;
  });
  const coloresOpciones = exigir(colores, "los colores").map((c) => ({ id: c.codigo, nombre: c.nombre, hex: c.hex, familia: c.familia_color, tipo: c.tipo }));
  // En su orden de curva (S · M · L, 28 · 30 · 32), no alfabético (L, M, S).
  const tallasOpciones = exigir(resTallas, "las tallas")
    .map((t) => ({ id: t.id, nombre: t.valor }))
    .sort((a, b) => compararTallas(a.nombre, b.nombre));

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
            {/* En el celular la frase se esconde (Felipe, 2026-10-09: las prendas primero); el «!» queda con todo lo que explica. */}
            <span className="max-sm:hidden">Cada prenda del catálogo con sus colores, tallas, precios y cuántas hay en tu sede.</span>
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
            {/* Grilla o Tabla muestran el mismo catálogo de otra forma: el segmento de modo del sistema, con su icono y su
                palabra (ADR-0358). */}
            <SegmentoEnlaces
              etiquetaAccesible="Cómo ver el catálogo"
              activo={vista}
              reemplazar={false}
              opciones={[
                { valor: "grilla", etiqueta: "Grilla", href: hrefConVista("grilla"), icono: <LayoutGrid aria-hidden strokeWidth={1.75} /> },
                { valor: "tabla", etiqueta: "Tabla", href: hrefConVista("tabla"), icono: <Rows3 aria-hidden strokeWidth={1.75} /> },
              ]}
              soloIconoEnCelular
            />
            {/* Rótulos de anaquel (ADR-0366) a la vista sin marcar nada (Felipe, 2026-10-09: «no encuentro el botón»): abre su buscador
                y «Volver» regresa a esta misma vista. Con prendas marcadas, la barra de abajo los lleva ya elegidos. */}
            {/* En el celular las tres acciones van en UNA fila (2026-10-09): Grilla/Tabla y Rótulos quedan en su ícono, con la
                palabra para el lector de pantalla y al pasar el mouse; «Nuevo producto» conserva la suya. */}
            <BotonEnlace href={urlRotulos([], { productos: hrefConVista(vista) }) ?? "/rotulos"} peso="fantasma" title="Rótulos" className="max-sm:!px-3">
              <SignpostBig aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              <span className="max-sm:sr-only">Rótulos</span>
            </BotonEnlace>
            {editaCatalogo && (
              <BotonEnlace href="/productos/nuevo" peso="primario">
                + Nuevo producto
              </BotonEnlace>
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


      <FiltrosProductos
        categorias={categoriasOpciones}
        colores={coloresOpciones}
        tallas={tallasOpciones}
        marcas={exigir(resMarcas, "las marcas")}
        proveedores={exigir(resProveedores, "los proveedores")}
        totalProductos={resultado.totalProductos}
        limitesPrecio={limitesRedondeados(facetas?.precio ?? null)}
        facetas={facetas}
        panelInicial={panelFiltros}
        sede={enSede ? persona.ubicacionEtiqueta : null}
        temporadas={temporadas ? temporadas.lista.map((t) => ({ id: t.clave, nombre: t.nombre })) : null}
        // El tamaño de las tarjetas, al final de la fila del conteo (2026-10-09): en el celular era una fila más entre el orden y las
        // prendas. Solo en la Grilla: la Tabla no tiene tarjetas.
        junto={vista === "grilla" && resultado.totalProductos > 0 ? <SelectorTamanoGrilla inicial={tamanoGrilla} /> : null}
      />

      {/* `data-resultados`: se atenúa mientras el buscador espera a la base (useBusquedaEnUrl). */}
      <div data-resultados className="space-y-6">
        {vista === "grilla" ? (
          <ProductosGrilla
            productos={productos}
            existencias={existencias}
            veExistencias={veModulo(persona, "existencias")}
            veMovimientos={veModulo(persona, "movimientos")}
            ubicacionId={persona.ubicacionId}
            sede={persona.ubicacionEtiqueta}
            puedeEditar={editaCatalogo}
            puedeEliminar={editaCatalogo}
            mensajeVacio={mensajeSinResultados(filtros, { descontinuadas })}
            hrefLimpiar="/productos"
            tamanoInicial={tamanoGrilla}
          />
        ) : (
          <ProductosTabla
            productos={productos}
            existencias={existencias}
            ubicacionId={persona.ubicacionId}
            sede={persona.ubicacionEtiqueta}
            puedeEditar={editaCatalogo}
            veExistencias={veModulo(persona, "existencias")}
            puedeEliminar={editaCatalogo}
            veDinero={puede(persona, "verDineroCompras")}
            mensajeVacio={mensajeSinResultados(filtros, { descontinuadas })}
            hrefLimpiar="/productos?vista=tabla"
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
