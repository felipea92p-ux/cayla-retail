import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { NuevoProductoForm } from "@/components/NuevoProductoForm";
import { getEjesPorCategoria } from "@/lib/catalogo-v2";

// Fase 2 (2026-09-15): alta de producto con matriz talla×color en una sola
// transacción (`crear_producto_con_variantes`) — hasta ahora `/productos`
// era solo lectura. Página propia, no modal: es la única forma de crear un
// producto y la grilla puede crecer a 15-20 celdas — mismo criterio que
// `/compras/nueva` (breadcrumb, sin la nav de pestañas). El candado real
// (solo Líder) vive en la RPC; el redirect de acá es solo la capa de UI.
export default async function NuevoProductoPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/productos");

  const supabase = await createClient();
  const [categorias, colores, ejes] = await Promise.all([
    exigir(
      await supabase.from("categorias").select("id, nombre").eq("activo", true).order("familia").order("nombre"),
      "las categorías del catálogo"
    ),
    exigir(
      await supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("orden"),
      "los colores del vocabulario"
    ),
    getEjesPorCategoria(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">
          <Link href="/productos" className="hover:text-rojo">
            Productos
          </Link>{" "}
          · Nuevo
        </p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Nuevo producto</h1>
      </div>

      {categorias.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay categorías activas en el catálogo.</p>
      ) : (
        <NuevoProductoForm categorias={categorias} colores={colores} ejes={ejes} />
      )}
    </div>
  );
}
