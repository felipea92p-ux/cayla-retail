import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getTaller } from "@/lib/produccion";
import { getLineasPorRecibir } from "@/lib/recibir-produccion";
import { RecibirProduccionPanel } from "@/components/RecibirProduccionPanel";

// Recibir insumos (ADR-0133, F4d): la tela y los avíos que llegan al Taller contra el comprobante del proveedor. Lo usa quien trabaja en el
// Taller —sin ver montos: esta pantalla solo maneja cantidades— y el líder. Como el resto de Producción, solo parado en el Taller.
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
        <h1 className="font-display text-2xl text-tinta">Recibir</h1>
        <p className="card-cayla p-5 text-sm text-tinta/75">No hay una ubicación de tipo Taller activa. Recibir necesita una para saber dónde entran los insumos.</p>
      </div>
    );
  }
  const lineas = await getLineasPorRecibir(taller.id);
  return (
    <div className="space-y-6">
      <RecibirProduccionPanel lineas={lineas} tallerId={taller.id} />
    </div>
  );
}
