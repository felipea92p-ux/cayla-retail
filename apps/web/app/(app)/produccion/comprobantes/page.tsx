import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { ProduccionSoloLider } from "@/components/ProduccionSoloLider";
import { getTaller } from "@/lib/produccion";
import { getComprobantesProduccion } from "@/lib/comprobantes-produccion";
import { getProveedoresProduccion } from "@/lib/proveedores-produccion";
import { hoyLima } from "@/lib/fechas-lima";
import { ComprobantesProduccionPanel } from "@/components/ComprobantesProduccionPanel";

// Comprobantes de Producción (ADR-0133, F4b; D-H): la factura del proveedor de tela, avíos o maquila, con su pago y su saldo. Es el
// libro APARTE del de Compras. Solo líder (dinero, D-G) y, como el resto de Producción, solo parado en el Taller.
export default async function ComprobantesProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} puedeCambiarUbicacion={persona.puedeCambiarUbicacion} />;
  }
  if (persona.rol !== "lider") return <ProduccionSoloLider titulo="Facturas de insumos" />;

  // Sin «Nueva factura» (Felipe 2026-11-25): la pantalla solo lista; las facturas nacen en Insumos y en Por pagar.
  const [comprobantes, proveedores, taller] = await Promise.all([getComprobantesProduccion(), getProveedoresProduccion(), getTaller()]);
  return (
    <div className="space-y-6">
      <ComprobantesProduccionPanel sede={persona.ubicacionEtiqueta} comprobantes={comprobantes} todosLosProveedores={proveedores} hoy={hoyLima()} tallerId={taller?.id ?? null} />
    </div>
  );
}
