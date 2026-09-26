import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller } from "@/lib/produccion";
import { getInsumosDelTaller } from "@/lib/insumos";
import { hoyLima } from "@/lib/fechas-lima";
import { InsumosPanel } from "@/components/InsumosPanel";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { puedeVerProduccion } from "@/lib/produccion-menu";

// Insumos del Taller (ADR-0133, F3): tela y avíos, con su saldo por lote. Mismo acceso que Órdenes (`puedeVerProduccion`):
// solo parado en el Taller, líder incluido. Quien no es líder ve cantidades, no dinero: los costos se recortan en
// `getInsumosDelTaller`, antes de salir del servidor. Ver docs/PLAN-PRODUCCION.md.
export default async function InsumosPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }

  const taller = await getTaller();
  if (!taller) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl text-tinta">Insumos</h1>
        <p className="card-cayla p-5 text-sm text-tinta/75">
          No hay una ubicación de tipo Taller activa. Insumos necesita una para saber dónde están la tela y los avíos.
        </p>
      </div>
    );
  }

  const esLider = persona.rol === "lider";
  const datos = await getInsumosDelTaller(taller.id, { conCostos: esLider, hoy: hoyLima() });

  return (
    <div className="space-y-6">
      <InsumosPanel datos={datos} tallerId={taller.id} esLider={esLider} />
    </div>
  );
}
