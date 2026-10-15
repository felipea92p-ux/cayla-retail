import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { getProveedoresProduccion } from "@/lib/proveedores-produccion";
import { getTarifasDeServicios } from "@/lib/tarifas-servicios";
import { hoyLima } from "@/lib/fechas-lima";
import { ProveedoresProduccionPanel } from "@/components/ProveedoresProduccionPanel";

// Proveedores de Producción (ADR-0133, F4a; D-H): quienes le venden tela, avíos y maquila al Taller. Directorio APARTE del de
// Compras. Solo líder: lleva datos bancarios de terceros y montos comprados (D-G). Quien trabaja en el Taller conocerá el
// nombre del proveedor al recibir un pedido (F4d), no esta pantalla.
// Dos vistas (ADR-0400, actividad 8c): «Proveedores» y «Servicios y tarifas»; `?vista=tarifas` abre la segunda (un enlace desde «Nueva orden» puede caer ahí).
export default async function ProveedoresProduccionPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const sp = await searchParams;
  const persona = await requirePersonaActualV2();
  // Misma puerta que Órdenes e Insumos (`puedeVerProduccion`, 2026-09-20): solo parado en el Taller. Además, solo líder.
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }
  if (persona.rol !== "lider") redirect("/produccion/ordenes");

  const [proveedores, tarifas] = await Promise.all([getProveedoresProduccion(), getTarifasDeServicios()]);
  return (
    <div className="space-y-6">
      <ProveedoresProduccionPanel sede={persona.ubicacionEtiqueta} proveedores={proveedores} tarifas={tarifas} hoy={hoyLima()} vistaInicial={sp.vista === "tarifas" ? "tarifas" : "proveedores"} />
    </div>
  );
}
