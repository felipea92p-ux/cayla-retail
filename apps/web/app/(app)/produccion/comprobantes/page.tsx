import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getTaller } from "@/lib/produccion";
import { getComprobantesProduccion, getInsumosParaComprobante } from "@/lib/comprobantes-produccion";
import { getProveedoresProduccion } from "@/lib/proveedores-produccion";
import { hoyLima } from "@/lib/fechas-lima";
import { ComprobantesProduccionPanel } from "@/components/ComprobantesProduccionPanel";

// Comprobantes de Producción (ADR-0133, F4b; D-H): la factura del proveedor de tela, avíos o maquila, con su pago y su saldo. Es el
// libro APARTE del de Compras. Solo líder (dinero, D-G) y, como el resto de Producción, solo parado en el Taller.
export default async function ComprobantesProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }
  if (persona.rol !== "lider") redirect("/produccion/ordenes");

  const [comprobantes, proveedores, insumos, taller] = await Promise.all([getComprobantesProduccion(), getProveedoresProduccion(), getInsumosParaComprobante(), getTaller()]);
  return (
    <div className="space-y-6">
      <ComprobantesProduccionPanel comprobantes={comprobantes} proveedores={proveedores.filter((p) => p.activo)} todosLosProveedores={proveedores} insumos={insumos} hoy={hoyLima()} tallerId={taller?.id ?? null} />
    </div>
  );
}
