import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getProducto, getEjesPorCategoria } from "@/lib/catalogo-v2";
import { getCatalogoMarcas } from "@/lib/marcas-datos";
import { ProductoForm } from "@/components/ProductoForm";
import { RevisarAltaBanner } from "@/components/RevisarAltaBanner";

// Edición de producto (V2). Mismo candado de cortesía que /productos/nuevo
// — la policy `productos_write_lider`/`variantes_write_lider` es la que de
// verdad decide.
export default async function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) redirect("/productos");

  const supabase = await createClient();
  const [producto, categorias, colores, ejes, resEtiquetas, marcas, familias] = await Promise.all([
    getProducto(id),
    exigir(
      await supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("familia").order("nombre"),
      "las categorías del catálogo"
    ),
    exigir(await supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("orden").order("nombre"), "los colores del vocabulario"),
    getEjesPorCategoria(),
    supabase.from("etiquetas").select("id, nombre, vigente_desde, vigente_hasta").eq("activo", true).eq("estado", "aprobado").order("nombre"),
    getCatalogoMarcas(),
    supabase.from("familias").select("codigo, exige_tejido_patron"),
  ]);
  // Qué familias exigen tejido y patrón (Indumentaria): la edición hereda la misma regla que el alta.
  const exigen = new Set(exigir(familias, "las familias del catálogo").filter((f) => f.exige_tejido_patron).map((f) => f.codigo));
  // Vigencia se filtra acá, no en la consulta: la etiqueta de campaña
  // (Halloween, CyberWow...) deja de OFRECERSE fuera de su ventana, pero
  // nunca se retira sola de una variante que ya la tenía — eso sería
  // perder un dato sin que nadie lo pidiera.
  const hoy = new Date().toISOString().slice(0, 10);
  const etiquetas = exigir(resEtiquetas, "las etiquetas del vocabulario")
    .filter((e) => (!e.vigente_desde || e.vigente_desde <= hoy) && (!e.vigente_hasta || e.vigente_hasta >= hoy))
    .map((e) => ({ id: e.id, texto: e.nombre }));

  if (!producto) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/productos" className="hover:text-rojo">
            Productos
          </Link>{" "}
          · {producto.referencia}
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          {producto.referencia}
          {producto.codigo && <span className="ml-2 font-mono text-base text-tinta/45">{producto.codigo}</span>}
        </h1>
      </div>

      {producto.estadoAlta === "pendiente" && <RevisarAltaBanner productoId={producto.id} />}

      <ProductoForm
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, prefijo: c.prefijo, exigeTejidoPatron: c.familia !== null && exigen.has(c.familia) }))}
        colores={colores}
        ejes={ejes}
        etiquetas={etiquetas}
        marcas={marcas}
        producto={producto}
      />

      {/* TODO(Sesión A2): acá va "Ajustar inventario" — modal standalone que
          recibe productoId (y, para preseleccionar la fila, varianteId) y
          escribe en `stock`/`movimientos`. Este form NO toca esas tablas
          (principio 6: separa lo esencial de lo incidental — "qué existe"
          vive acá, "cuánto hay" es Inventario). */}
      {/* TODO(Sesión A3): acá va "Ver historial del producto" — panel
          standalone de solo lectura sobre `movimientos` filtrado por las
          variantes de este producto. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-cayla space-y-1 border-dashed p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
          <p className="text-sm text-tinta/55">TODO(Sesión A2): acá va &quot;Ajustar inventario&quot;.</p>
        </div>
        <div className="card-cayla space-y-1 border-dashed p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Historial</p>
          <p className="text-sm text-tinta/55">TODO(Sesión A3): acá va &quot;Ver historial&quot;.</p>
        </div>
      </div>
    </div>
  );
}
