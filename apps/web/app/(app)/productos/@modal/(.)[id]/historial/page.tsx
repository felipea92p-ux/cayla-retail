import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getHistorialPrenda, getPrendaDelHistorial } from "@/lib/historial-prenda";
import { HistorialPrenda } from "@/components/historial-prenda/HistorialPrenda";
import { ModalRuta } from "@/components/ui/ModalRuta";

// Historial de una prenda como ventana, encima de la lista desde la que se abrió (ADR-0354).
//
// Ruta interceptada de Next: al navegar a `/productos/<id>/historial` DESDE otra pantalla de Productos (el botón «Historial» de una
// fila de la Tabla), Next no cambia la pantalla de fondo: dibuja esta página en el slot `modal` del layout y deja la lista donde
// estaba. La URL sí cambia, así que copiarla, compartirla o recargar muestra la página completa (`../../../[id]/historial/page.tsx`):
// el mismo hilo, sin ventana. Desde la Grilla, el historial se abre dentro de la vista rápida (no pasa por aquí).
export default async function HistorialProductoModal({ params }: { params: Promise<{ id: string }> }) {
  const persona = await requirePersonaActualV2();
  const { id: productoId } = await params;
  const [prenda, lectura] = await Promise.all([getPrendaDelHistorial(productoId), getHistorialPrenda(productoId)]);
  if (!prenda) {
    return (
      <ModalRuta titulo="Producto no encontrado" ancho="max-w-sm">
        <p className="text-sm text-tinta/75">No existe un producto con ese enlace, o ya no tienes acceso a él.</p>
      </ModalRuta>
    );
  }

  return (
    <ModalRuta titulo="Historial" subtitulo={`«${prenda.referencia}» · lo que cambió en esta prenda, quién lo hizo y cuándo`} ancho="max-w-4xl">
      <HistorialPrenda
        lectura={lectura}
        nombre={prenda.referencia}
        totalVariantes={prenda.variantes}
        hrefMovimientos={veModulo(persona, "movimientos") ? `/inventario/movimientos?q=${encodeURIComponent(prenda.codigo ?? prenda.referencia)}` : null}
      />
    </ModalRuta>
  );
}
