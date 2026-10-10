import { exigirModulo } from "@/lib/persona-actual";
import { getDetalleOrden } from "@/lib/ordenes-compra";
import { fraseDestino, numeroOrdenCompra } from "@/lib/ordenes-compra-reglas";
import { ModalRuta } from "@/components/ui/ModalRuta";
import { DetalleOrdenCompra } from "@/components/ordenes-compra/DetalleOrdenCompra";
import { BotonEditarOrden } from "@/components/ordenes-compra/BotonEditarOrden";

// Una orden de compra como ventana, encima de la lista desde la que se abrió (ADR-0362, fase 1 · actividad 3). Ruta interceptada,
// como el detalle de una factura: al tocar una fila de `/compras/ordenes`, Next dibuja esto en el slot `modal` del layout de Compras y la
// lista se queda donde estaba (scroll y filtros). La URL cambia a `/compras/ordenes/ver/<id>`: recargar o compartir muestra la página
// completa (`ordenes/ver/[id]/page.tsx`), con el mismo cuerpo. Se cierra con la ✕, Escape o el velo, que vuelven atrás.
export default async function OrdenCompraModal({ params }: { params: Promise<{ id: string }> }) {
  await exigirModulo("ordenes_compra");
  const { id } = await params;
  const { detalle, falla } = await getDetalleOrden(id);

  if (falla || !detalle) {
    return (
      <ModalRuta titulo={falla ? "No se pudo leer la orden" : "No encontramos esa orden"} ancho="max-w-sm">
        <p className="text-sm text-tinta/75">{falla ?? "El enlace no corresponde a ninguna orden de compra."}</p>
      </ModalRuta>
    );
  }

  return (
    <ModalRuta
      titulo={numeroOrdenCompra(detalle.numero)}
      subtitulo={`${detalle.proveedor.nombre} · ${fraseDestino(detalle.destino?.nombre ?? null)}`}
      // Solo una «generada» se edita (actividad 4). El pie de la ventana es donde la mano ya está al terminar de leer.
      acciones={detalle.estado === "generada" ? <BotonEditarOrden id={detalle.id} /> : undefined}
    >
      <DetalleOrdenCompra orden={detalle} />
    </ModalRuta>
  );
}
