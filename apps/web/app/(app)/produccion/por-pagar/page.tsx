import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { ProduccionSoloLider } from "@/components/ProduccionSoloLider";
import { getComprobantesProduccion, getFaltantesPorComprobante, getServiciosPorPagar } from "@/lib/comprobantes-produccion";
import { opcional } from "@/lib/resultado";
import { getDeudaConsolidada, getIgvDelMes } from "@/lib/deuda-consolidada";
import { hoyLima } from "@/lib/fechas-lima";
import { PorPagarProduccionPanel } from "@/components/PorPagarProduccionPanel";

// Por pagar de Producción (ADR-0133, F4c) y el consolidado de deuda e IGV de D-I. Solo líder (dinero, D-G) y, como el resto de Producción,
// solo parado en el Taller. El consolidado LEE Compras y Producción sin modificar ninguno de los dos libros.
export default async function PorPagarProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} puedeCambiarUbicacion={persona.puedeCambiarUbicacion} />;
  }
  if (persona.rol !== "lider") return <ProduccionSoloLider titulo="Por pagar" />;

  const [comprobantes, deuda, igv, faltantes, servicios] = await Promise.all([
    getComprobantesProduccion(),
    getDeudaConsolidada(),
    getIgvDelMes(),
    // Dato de apoyo (P02, opción B): si no se puede leer, la pantalla se ve como siempre.
    opcional(getFaltantesPorComprobante(), "lo que faltó llegar de cada pedido"),
    // Sin la migración de ADR-0614 la función no existe: la pantalla se ve como siempre.
    opcional(getServiciosPorPagar(), "lo que se les debe a los servicios"),
  ]);
  return (
    <div className="space-y-6">
      <PorPagarProduccionPanel sede={persona.ubicacionEtiqueta} comprobantes={comprobantes} deuda={deuda} igv={igv} faltantes={faltantes ?? {}} servicios={servicios ?? []} hoy={hoyLima()} />
    </div>
  );
}
