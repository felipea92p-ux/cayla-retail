import Link from "next/link";
import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { encontrarPorTipo, getSububicaciones } from "@/lib/sububicaciones";
import { NuevoProductoForm } from "@/components/NuevoProductoForm";
import { getContextoAlta } from "@/lib/alta-producto-datos";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";

// Nuevo producto como árbol de decisión (ADR-0109): familia → categoría →
// nombre → talla/tejido/patrón → colores → precio → etiquetas → cuántas hay
// hoy (ADR-0212), en una sola transacción (`crear_producto_con_stock_inicial`),
// en 5 pasos (spike 2026-09-24). Página propia y no modal: la
// matriz puede crecer a 15-20 celdas — mismo criterio que `/compras/nueva`.
// El candado real (solo Líder) vive en la RPC; el redirect de acá es solo la
// capa de UI.
export default async function NuevoProductoPage() {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) redirect("/productos");

  // En paralelo: el contexto del alta y cómo es la tienda donde entra el stock de hoy (la sede activa de la cabecera).
  const [contexto, sububicaciones] = await Promise.all([getContextoAlta(), getSububicaciones(persona.ubicacionId)]);
  const destino = {
    ubicacionId: persona.ubicacionId,
    etiqueta: persona.ubicacionEtiqueta,
    separaPiso: encontrarPorTipo(sububicaciones, "piso_venta") !== null && encontrarPorTipo(sububicaciones, "almacen_tienda") !== null,
    puedeBajar: veModulo(persona, "bajada_piso"),
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[12.5px] text-taupe">
          <Link href="/productos" className="underline underline-offset-2 hover:text-tinta">
            Productos
          </Link>{" "}
          · Nuevo
        </p>
        <CabeceraPantalla
          sobretitulo="Catálogo · Productos"
          titulo="Nuevo producto"
          bajada="Cinco pasos. Cada uno se cierra en una línea al terminarlo y a la derecha ves la prenda que se va a crear. El último carga lo que ya tienes en tienda."
        />
      </div>

      {contexto.categorias.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay categorías activas en el catálogo.</p>
      ) : (
        // `key`: si se cambia de sede en la cabecera, el stock de hoy es de OTRA tienda: el formulario empieza de nuevo.
        <NuevoProductoForm key={persona.ubicacionId} contexto={contexto} destino={destino} />
      )}
    </div>
  );
}
