import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { NuevoProductoForm } from "@/components/NuevoProductoForm";
import { getContextoAlta } from "@/lib/alta-producto-datos";

// Nuevo producto como árbol de decisión (ADR-0108): familia → categoría →
// nombre → talla/tejido/patrón → colores → precio → etiquetas, en una sola
// transacción (`crear_producto_con_variantes`). Página propia y no modal: la
// matriz puede crecer a 15-20 celdas — mismo criterio que `/compras/nueva`.
// El candado real (solo Líder) vive en la RPC; el redirect de acá es solo la
// capa de UI.
export default async function NuevoProductoPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/productos");

  const contexto = await getContextoAlta();

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

      {contexto.categorias.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay categorías activas en el catálogo.</p>
      ) : (
        <NuevoProductoForm contexto={contexto} />
      )}
    </div>
  );
}
