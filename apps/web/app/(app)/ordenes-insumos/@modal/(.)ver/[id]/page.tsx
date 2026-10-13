import { exigirModulo } from "@/lib/persona-actual";
import { getDetalleOrdenInsumo, getEmpresaParaOrden } from "@/lib/ordenes-insumo";
import { numeroOrdenInsumo } from "@/lib/ordenes-insumo-reglas";
import { ModalRuta } from "@/components/ui/ModalRuta";
import { DetalleOrdenInsumo } from "@/components/ordenes-insumo/DetalleOrdenInsumo";
import { AccionesOrdenInsumo } from "@/components/ordenes-insumo/AccionesOrdenInsumo";

// Una orden de insumos como ventana, encima de la lista desde la que se abrió (ADR-0362, fase 7 · actividad 2), como la orden de compra:
// al tocar una fila de `/ordenes-insumos`, Next dibuja esto en el slot `modal` del layout y la lista se queda donde estaba (scroll y
// filtros). La URL cambia a `/ordenes-insumos/ver/<id>`: recargar o compartir muestra la página completa (`ver/[id]/page.tsx`), con el
// mismo cuerpo. Se cierra con la ✕, Escape o el velo, que vuelven atrás.
export default async function OrdenInsumoModal({ params }: { params: Promise<{ id: string }> }) {
  await exigirModulo("ordenes_insumos");
  const { id } = await params;
  const [{ detalle, falla }, empresa] = await Promise.all([getDetalleOrdenInsumo(id), getEmpresaParaOrden()]);

  if (falla || !detalle) {
    return (
      <ModalRuta titulo={falla ? "No se pudo leer la orden" : "No encontramos esa orden"} ancho="max-w-sm">
        <p className="text-sm text-tinta/75">{falla ?? "El enlace no corresponde a ninguna orden de insumos."}</p>
      </ModalRuta>
    );
  }

  return (
    <ModalRuta titulo={numeroOrdenInsumo(detalle.numero)} acciones={<AccionesOrdenInsumo lugar="pie" orden={detalle} empresa={empresa} />}>
      <DetalleOrdenInsumo orden={detalle} />
    </ModalRuta>
  );
}
