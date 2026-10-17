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
import { desdeDeParams, vueltaAProductos } from "@/lib/vuelta-productos";
import { Volver } from "@/components/ui/Volver";
import { Chip } from "@/components/ui/Chip";
import { precioUnico } from "@/lib/precio-sede-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { esUuid } from "@/lib/club-registro-reglas";


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
  // Un id que no es un uuid no es ningún producto: «no existe», no la pantalla de error (/chaos 2026-10-13, #12).
  if (!esUuid(id)) notFound();
  // Tabla o Grilla, con sus filtros: de donde se salió a editar (`lib/vuelta-productos.ts`).
  const volverA = vueltaAProductos(desdeDeParams((await searchParams).desde));
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) redirect("/productos");

  const supabase = await createClient();
  const [producto, categorias, colores, ejes, resEtiquetas, marcas, familias, imagenes, resEstado, resTiendas] = await Promise.all([
    getProducto(id),
    exigir(
      await supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("familia").order("nombre"),
      "las categorías del catálogo"
    ),
    // Con familia y sinónimos, como el alta (lib/alta-producto-datos.ts): «Agregar color» busca «plomo» y encuentra Gris.
    exigir(
      // Y con Pantone y su ficha (ADR-0316): «Agregar colores» reutiliza la carta del alta y su pie dice lo mismo que allá.
      await supabase.from("colores").select("codigo, nombre, hex, familia_color, tipo, sinonimos, pantone_tcx, descripcion, combina_con").eq("activo", true).order("orden").order("nombre"),
      "los colores del vocabulario"
    ),
    getEjesPorCategoria(),
    supabase.from("etiquetas").select("id, nombre, estilo, vigente_desde, vigente_hasta, descuento_pct").eq("activo", true).eq("estado", "aprobado").order("nombre"),
    getCatalogoMarcas(),
    supabase.from("familias").select("codigo, exige_tejido_patron, entra_a_motores"),
    getImagenesMuestra(),
    // ADR-0263: unidades y ventas por variante. Tolerante: si falla, la ficha sigue sin la columna de stock y la base
    // decide sola quién corrige una variante vendida. Si la función NO EXISTE, la base tampoco sabe corregir (es el mismo
    // SQL): ver `puedeCorregir`, abajo.
    supabase.rpc("fn_variantes_estado", { p_producto_id: id }),
    // Precio por tienda (Felipe 2026-10-09): las tiendas abiertas. Tolerante: si falla, el bloque solo se lee.
    supabase.from("ubicaciones").select("id, nombre").eq("tipo", "tienda").eq("activo", true).order("nombre"),
  ]);
  // Qué familias exigen tejido y patrón (Indumentaria): la edición hereda la misma regla que el alta.
  const filasFamilias = exigir(familias, "las familias del catálogo");
  const exigen = new Set(filasFamilias.filter((f) => f.exige_tejido_patron).map((f) => f.codigo));
  // Las familias fuera de los motores (Empaque, ADR-0377) admiten precio 0: la bolsa de obsequio (Felipe 2026-10-10).
  const admitenPrecioCero = new Set(filasFamilias.filter((f) => f.entra_a_motores === false).map((f) => f.codigo));
  // Vigencia se filtra acá, no en la consulta: la etiqueta de campaña
  // (Halloween, CyberWow...) deja de OFRECERSE fuera de su ventana, pero
  // nunca se retira sola de una variante que ya la tenía — eso sería
  // perder un dato sin que nadie lo pidiera.
  const hoy = new Date().toISOString().slice(0, 10);
  // Quien edita Productos cambia aquí las etiquetas de la prenda, con descuento o sin él (ADR-0293, Felipe 2026-09-30: la ficha
  // perdió su guardia en `actualizar_variantes_etiquetas`, en producción desde ese día). Esta pantalla seguía escondiendo las de
  // descuento a quien no es líder, con el aviso «las pone un líder», que ya no era cierto (revisión 2026-10-03).
  const esLider = persona.rol === "lider";
  const vocabulario = exigir(resEtiquetas, "las etiquetas del vocabulario");
  // Una campaña se pone o se quita con el módulo Campañas, también desde aquí (ADR-0436, 20261017212000): a quien no lo tiene no se le
  // ofrece. Las que la prenda ya lleva se quedan al guardar (la ficha las manda igual y la base no deja sacarlas sin la llave).
  const veCampanas = veModulo(persona, "campanas");
  const vigente = (e: { vigente_desde: string | null; vigente_hasta: string | null }) =>
    (!e.vigente_desde || e.vigente_desde <= hoy) && (!e.vigente_hasta || e.vigente_hasta >= hoy);
  const etiquetas = vocabulario
    .filter(vigente)
    .filter((e) => veCampanas || e.estilo !== "campana")
    .map((e) => ({ id: e.id, texto: e.nombre, estilo: e.estilo ?? "neutral" }));
  const avisoEtiquetas =
    !veCampanas && vocabulario.some((e) => e.estilo === "campana" && vigente(e))
      ? "Las campañas no se eligen aquí: se ponen en Tienda web ▸ Campañas, con su módulo. Las que la prenda ya tiene se quedan."
      : undefined;

  if (!producto) notFound();

  // La web puede llegar a producción antes que el SQL de ADR-0263 (ya pasó). Sin él, la base ignora la corrección de color
  // o talla de una variante SIN error, pero sí guarda las fotos que se movieron con ella: las variantes quedarían Negro y
  // sus fotos Azul. Por eso, sin la función la ficha no ofrece corregir (lo dice en una línea); cualquier otro fallo de la
  // lectura (red, permiso) no dice que la función falte y deja corregir: la base vuelve a exigir todo.
  const puedeCorregir = !esFuncionAusente(resEstado.error);

  // Ajustar el stock desde la ficha (Felipe, 2026-09-29; ADR-0270, actualización de la decisión 9). Es la ventana de Existencias
  // sobre la SEDE ACTIVA, y solo para quien tiene el módulo «Ajustar stock» (`ajustarStock`), que es lo mismo que exige la base
  // (`ajustar_inventario`). «Bajada al piso» sigue las mismas reglas que en Existencias: el rol lo ve y la sede separa piso y almacén.
  // Sin el módulo, el stock de la sede se LEE igual (`lecturaStock`): antes no se pedía y la matriz y el panel mostraban 0 en cada
  // talla, que se lee como «no hay nada» (revisión del 2026-10-03). Se ve, no se toca.
  const puedeAjustarStock = puede(persona, "ajustarStock");
  const sububicaciones = await getSububicaciones(persona.ubicacionId);
  const separaPisoAlmacen = encontrarPorTipo(sububicaciones, "piso_venta") !== null && encontrarPorTipo(sububicaciones, "almacen_tienda") !== null;
  const ajusteStock = puedeAjustarStock
    ? {
        productoId: producto.id,
        ubicacionId: persona.ubicacionId,
        sede: persona.ubicacionEtiqueta,
        sububicaciones,
        puedeBajarAlPiso: separaPisoAlmacen, // la carga inicial no pide Existencias (ADR-0306 act. 2026-10-03)
      }
    : null;

  // Precio por tienda: quien edita Productos lo pone en SU tienda; el líder, en cualquiera (la base vuelve a exigirlo:
  // `poner_precio_sede`). El precio de la prenda es uno solo si todas sus tallas activas valen igual (si no, null: «según la talla»,
  // y ningún monto es «igual al de la prenda», que es lo que la base rechaza). La ficha muestra TODAS las tiendas (`todas`).
  const tiendas = resTiendas.data ?? [];
  const tiendasPrecio = esLider ? tiendas : tiendas.filter((t) => t.id === persona.ubicacionId);
  const preciosActivos = (producto.variantes ?? []).filter((v) => v.activo).map((v) => Number(v.precio)).filter((n) => n > 0);
  const precioPrenda = precioUnico(preciosActivos);

  return (
    <div className="space-y-6">
      <div data-guia="editar.cabecera">
        {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14): la prenda de título y su código en la línea de
            arriba. */}
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          detalle={producto.codigo ? <span className="font-mono normal-case tracking-normal">{producto.codigo}</span> : undefined}
          volver={<Volver href={volverA} a="Productos" />}
          titulo={producto.referencia}
          pie={
            // ADR-0371: una insignia, no un aviso con botones (Felipe quitó el aviso el 2026-10-02: «no me sirve»). Se aprueba o se rechaza
            // desde Productos ▸ Por revisar; aquí solo se dice qué es.
            producto.estadoAlta === "pendiente" && (
              <span title="Alguien la propuso sin editar el catálogo. Quien edita el catálogo la aprueba o la rechaza en Productos ▸ Por revisar.">
                <Chip tono="ambar" versalitas={false}>
                  Pendiente de revisión
                </Chip>
              </span>
            )
          }
        />
      </div>

      <ProductoForm
        categorias={categorias.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          prefijo: c.prefijo,
          exigeTejidoPatron: c.familia !== null && exigen.has(c.familia),
          admitePrecioCero: c.familia !== null && admitenPrecioCero.has(c.familia),
        }))}
        colores={colores.map((c) => ({
          codigo: c.codigo,
          nombre: c.nombre,
          hex: c.hex,
          familiaColor: c.familia_color ?? "",
          tipo: c.tipo,
          sinonimos: c.sinonimos ?? [],
          pantoneTcx: c.pantone_tcx ?? null,
          descripcion: c.descripcion ?? null,
          combinaCon: c.combina_con ?? [],
        }))}
        ejes={ejes}
        imagenes={imagenes}
        etiquetas={etiquetas}
        avisoEtiquetas={avisoEtiquetas}
        marcas={marcas}
        estadoVariantes={resEstado.error ? null : leerEstadoVariantes(resEstado.data)}
        esLider={esLider}
        puedeCorregir={puedeCorregir}
        ajusteStock={ajusteStock}
        lecturaStock={{ ubicacionId: persona.ubicacionId, sububicaciones }}
        preciosSede={{
          tiendas: tiendasPrecio,
          todas: tiendas,
          general: precioPrenda,
          ubicacionId: persona.ubicacionId,
          sede: persona.ubicacionEtiqueta,
        }}
        producto={producto}
        volverA={volverA}
      />
    </div>
  );
}
