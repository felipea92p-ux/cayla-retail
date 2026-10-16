import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getTaller } from "@/lib/produccion";
import { getLineasPorRecibir } from "@/lib/recibir-produccion";
import { getOrdenesInsumoPorRecibir } from "@/lib/recepcion-orden-insumo";
import { RecibirProduccionPanel } from "@/components/RecibirProduccionPanel";
import { Factory } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Recibir insumos (ADR-0133, F4d): la tela y los avíos que llegan al Taller contra el comprobante del proveedor. Lo usa quien trabaja en el
// Taller —sin ver montos: esta pantalla solo maneja cantidades— y el líder. Como el resto de Producción, solo parado en el Taller. Desde la
// fase 7 parte 2 (ADR-0362), también contra la orden de insumos: con el costo de ESA orden a la vista (decisión 53).
export default async function RecibirProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }
  const taller = await getTaller();
  if (!taller) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Recibir" />
        <div className="card-cayla">
          <Vacio icono={<Factory />} titulo="No hay un Taller activo">
            Recibir necesita una ubicación de tipo Taller para saber dónde entran los insumos. Pídele al líder que active el Taller.
          </Vacio>
        </div>
      </div>
    );
  }
  const [lineas, ordenes] = await Promise.all([getLineasPorRecibir(taller.id), getOrdenesInsumoPorRecibir(taller.id)]);
  return (
    <div className="space-y-6">
      <RecibirProduccionPanel sede={persona.ubicacionEtiqueta} lineas={lineas} ordenesInsumo={ordenes.ordenes} fallaOrdenes={ordenes.falla} tallerId={taller.id} />
    </div>
  );
}
