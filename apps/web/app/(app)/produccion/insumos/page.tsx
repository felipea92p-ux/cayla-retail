import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller } from "@/lib/produccion";
import { getInsumosDelTaller } from "@/lib/insumos";
import { hoyLima } from "@/lib/fechas-lima";
import { InsumosPanel } from "@/components/InsumosPanel";

// Insumos del Taller (ADR-0133, F3): tela y avíos, con su saldo por lote. Mismo acceso que Órdenes (D-A): el líder desde
// cualquier ubicación y quien trabaja en el Taller. Quien no es líder ve cantidades, no dinero: los costos se recortan
// en `getInsumosDelTaller`, antes de salir del servidor. Ver docs/PLAN-PRODUCCION.md.
export default async function InsumosPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider" && persona.ubicacionTipo !== "taller") redirect("/");

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
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{taller.nombre}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Insumos</h1>
        <p className="mt-1 text-sm text-tinta/65">
          La tela y los avíos del Taller: lo que hay por lote, cuánto dura y qué falta. El saldo siempre es la suma de sus movimientos.
        </p>
      </div>

      <InsumosPanel datos={datos} tallerId={taller.id} esLider={esLider} />
    </div>
  );
}
