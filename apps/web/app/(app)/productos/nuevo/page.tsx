import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { encontrarPorTipo, getSububicaciones } from "@/lib/sububicaciones";
import { NuevoProductoForm } from "@/components/NuevoProductoForm";
import { getContextoAlta } from "@/lib/alta-producto-datos";
import { getCargaInicial } from "@/lib/carga-inicial";
import { cargaInicialDe } from "@/lib/carga-inicial-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";

// Nuevo producto como árbol de decisión (ADR-0109) en 4 preguntas (spike v2
// 2026-09-28, docs/maquetas/producto-nuevo-v2-2026-09): categoría → cómo es
// (nombre, marca, tejido, patrón) → tallas y colores (la tabla, con fotos) →
// precio y cuántas hay hoy (ADR-0212), en una sola transacción
// (`crear_producto_con_stock_inicial`). Página propia y no modal: la tabla
// puede crecer a 9 tallas × 8 colores — mismo criterio que `/compras/nueva`.
// El candado real (solo Líder) vive en la RPC; el redirect de acá es solo la
// capa de UI.
export default async function NuevoProductoPage() {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) redirect("/productos");

  // En paralelo: el contexto del alta, cómo es la tienda donde entra el stock de hoy (la sede activa de la cabecera) y hasta cuándo
  // esa sede acepta carga inicial (ADR-0328; `null` si la base todavía no lo sabe: el paso 4 no avisa nada).
  const [contexto, sububicaciones, carga] = await Promise.all([getContextoAlta(), getSububicaciones(persona.ubicacionId), getCargaInicial()]);
  const destino = {
    ubicacionId: persona.ubicacionId,
    etiqueta: persona.ubicacionEtiqueta,
    separaPiso: encontrarPorTipo(sububicaciones, "piso_venta") !== null && encontrarPorTipo(sububicaciones, "almacen_tienda") !== null,
  };

  return (
    <div className="space-y-6">
      {/* La cabecera de Ventas, como Productos (ADR-0254; Felipe 2026-09-28): sede y hora arriba con el hilo, el título
          del menú y su frase; la vuelta «← Productos» va bajo la frase, como «← Existencias» en Colgar en el piso. */}
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Nuevo producto"
        subtitulo="Cuatro preguntas sobre la prenda que tienes en la mano. A la derecha la ves tal como va a quedar."
        pie={<Volver forma="boton" href="/productos" a="Productos" />}
      />

      {contexto.categorias.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay categorías activas en el catálogo.</p>
      ) : (
        // `key`: si se cambia de sede en la cabecera, el stock de hoy es de OTRA tienda: el formulario empieza de nuevo.
        <NuevoProductoForm
          key={persona.ubicacionId}
          contexto={contexto}
          destino={destino}
          cargaInicial={cargaInicialDe(carga, persona.ubicacionId)}
          puedeAprobarEtiquetas={puede(persona, "editarEtiquetas")}
        />
      )}
    </div>
  );
}
