import { notFound, redirect } from "next/navigation";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { encontrarPorTipo, getSububicaciones } from "@/lib/sububicaciones";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getProducto, getEjesPorCategoria, getImagenesMuestra } from "@/lib/catalogo-v2";
import { getCatalogoMarcas } from "@/lib/marcas-datos";
import { leerEstadoVariantes } from "@/lib/variantes-ficha-reglas";
import { esFuncionAusente } from "@/lib/compras-reglas";
import { ProductoForm } from "@/components/ProductoForm";
import { RevisarAltaBanner } from "@/components/RevisarAltaBanner";
import { desdeDeParams, vueltaAProductos } from "@/lib/vuelta-productos";
import { Volver } from "@/components/ui/Volver";

// Edición de producto (V2). Mismo candado de cortesía que /productos/nuevo
// — la policy `productos_write_lider`/`variantes_write_lider` es la que de
// verdad decide.

export default async function EditarProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string | string[] }>;
}) {
  const { id } = await params;
  // Tabla o Grilla, con sus filtros: de donde se salió a editar (`lib/vuelta-productos.ts`).
  const volverA = vueltaAProductos(desdeDeParams((await searchParams).desde));
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) redirect("/productos");

  const supabase = await createClient();
  const [producto, categorias, colores, ejes, resEtiquetas, marcas, familias, imagenes, resEstado] = await Promise.all([
    getProducto(id),
    exigir(
      await supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("familia").order("nombre"),
      "las categorías del catálogo"
    ),
    // Con familia y sinónimos, como el alta (lib/alta-producto-datos.ts): «Agregar color» busca «plomo» y encuentra Gris.
    exigir(
      await supabase.from("colores").select("codigo, nombre, hex, familia_color, sinonimos").eq("activo", true).order("orden").order("nombre"),
      "los colores del vocabulario"
    ),
    getEjesPorCategoria(),
    supabase.from("etiquetas").select("id, nombre, vigente_desde, vigente_hasta, descuento_pct").eq("activo", true).eq("estado", "aprobado").order("nombre"),
    getCatalogoMarcas(),
    supabase.from("familias").select("codigo, exige_tejido_patron"),
    getImagenesMuestra(),
    // ADR-0263: unidades y ventas por variante. Tolerante: si falla, la ficha sigue sin la columna de stock y la base
    // decide sola quién corrige una variante vendida. Si la función NO EXISTE, la base tampoco sabe corregir (es el mismo
    // SQL): ver `puedeCorregir`, abajo.
    supabase.rpc("fn_variantes_estado", { p_producto_id: id }),
  ]);
  // Qué familias exigen tejido y patrón (Indumentaria): la edición hereda la misma regla que el alta.
  const exigen = new Set(exigir(familias, "las familias del catálogo").filter((f) => f.exige_tejido_patron).map((f) => f.codigo));
  // Vigencia se filtra acá, no en la consulta: la etiqueta de campaña
  // (Halloween, CyberWow...) deja de OFRECERSE fuera de su ventana, pero
  // nunca se retira sola de una variante que ya la tenía — eso sería
  // perder un dato sin que nadie lo pidiera.
  const hoy = new Date().toISOString().slice(0, 10);
  // ADR-0161 P4 (20260923140000): quien edita Productos cambia aquí las etiquetas SIN descuento de la prenda, sin necesitar el
  // módulo Etiquetas. Poner o quitar una CON descuento cambia el precio en caja y es solo del líder: a los demás no se les
  // ofrece (la que ya tenga la prenda se conserva tal cual: el selector no la muestra y el guardado no la toca). La base lo
  // vuelve a exigir en `actualizar_variantes_etiquetas`.
  const esLider = persona.rol === "lider";
  const vocabulario = exigir(resEtiquetas, "las etiquetas del vocabulario");
  const etiquetas = vocabulario
    .filter((e) => (!e.vigente_desde || e.vigente_desde <= hoy) && (!e.vigente_hasta || e.vigente_hasta >= hoy))
    .filter((e) => esLider || e.descuento_pct == null)
    .map((e) => ({ id: e.id, texto: e.nombre }));
  const hayConDescuento = !esLider && vocabulario.some((e) => e.descuento_pct != null);

  if (!producto) notFound();

  // La web puede llegar a producción antes que el SQL de ADR-0263 (ya pasó). Sin él, la base ignora la corrección de color
  // o talla de una variante SIN error, pero sí guarda las fotos que se movieron con ella: las variantes quedarían Negro y
  // sus fotos Azul. Por eso, sin la función la ficha no ofrece corregir (lo dice en una línea); cualquier otro fallo de la
  // lectura (red, permiso) no dice que la función falte y deja corregir: la base vuelve a exigir todo.
  const puedeCorregir = !esFuncionAusente(resEstado.error);

  // Ajustar el stock desde la ficha (Felipe, 2026-09-29; ADR-0270, actualización de la decisión 9). Es la ventana de Existencias
  // sobre la SEDE ACTIVA, y solo para quien tiene el módulo «Ajustar stock» (`ajustarStock`), que es lo mismo que exige la base
  // (`ajustar_inventario`). Sin el módulo no se pide ni una consulta más. «Bajada al piso» sigue las mismas reglas que en
  // Existencias: el rol lo ve y la sede separa piso y almacén.
  const puedeAjustarStock = puede(persona, "ajustarStock");
  const sububicaciones = puedeAjustarStock ? await getSububicaciones(persona.ubicacionId) : [];
  const separaPisoAlmacen = encontrarPorTipo(sububicaciones, "piso_venta") !== null && encontrarPorTipo(sububicaciones, "almacen_tienda") !== null;
  const ajusteStock = puedeAjustarStock
    ? {
        productoId: producto.id,
        ubicacionId: persona.ubicacionId,
        sede: persona.ubicacionEtiqueta,
        sububicaciones,
        puedeBajarAlPiso: veModulo(persona, "existencias") && separaPisoAlmacen,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Volver href={volverA} a="Productos" className="mb-2" />
        <h1 className="font-display mt-1 text-2xl text-tinta">
          {producto.referencia}
          {producto.codigo && <span className="ml-2 font-mono text-base text-tinta/45">{producto.codigo}</span>}
        </h1>
      </div>

      {producto.estadoAlta === "pendiente" && <RevisarAltaBanner productoId={producto.id} />}

      <ProductoForm
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, prefijo: c.prefijo, exigeTejidoPatron: c.familia !== null && exigen.has(c.familia) }))}
        colores={colores.map((c) => ({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, familiaColor: c.familia_color ?? "", sinonimos: c.sinonimos ?? [] }))}
        ejes={ejes}
        imagenes={imagenes}
        etiquetas={etiquetas}
        avisoEtiquetas={hayConDescuento ? "Las etiquetas con descuento las pone o quita un líder." : undefined}
        marcas={marcas}
        estadoVariantes={resEstado.error ? null : leerEstadoVariantes(resEstado.data)}
        esLider={esLider}
        puedeCorregir={puedeCorregir}
        ajusteStock={ajusteStock}
        producto={producto}
        volverA={volverA}
      />
    </div>
  );
}
