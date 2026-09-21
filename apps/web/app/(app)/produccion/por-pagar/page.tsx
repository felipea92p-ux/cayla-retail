import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getComprobantesProduccion } from "@/lib/comprobantes-produccion";
import { getDeudaConsolidada, getIgvDelMes } from "@/lib/deuda-consolidada";
import { hoyLima } from "@/lib/fechas-lima";
import { PorPagarProduccionPanel } from "@/components/PorPagarProduccionPanel";

// Por pagar de Producción (ADR-0133, F4c) y el consolidado de deuda e IGV de D-I. Solo líder (dinero, D-G) y, como el resto de Producción,
// solo parado en el Taller. El consolidado LEE Compras y Producción sin modificar ninguno de los dos libros.
export default async function PorPagarProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }
  if (persona.rol !== "lider") redirect("/produccion/ordenes");

  const [comprobantes, deuda, igv] = await Promise.all([getComprobantesProduccion(), getDeudaConsolidada(), getIgvDelMes()]);
  return (
    <div className="space-y-6">
      <PorPagarProduccionPanel comprobantes={comprobantes} deuda={deuda} igv={igv} hoy={hoyLima()} />
    </div>
  );
}
