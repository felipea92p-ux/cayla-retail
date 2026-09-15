import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller, getOrdenesProduccion, getModelosProducibles } from "@/lib/produccion";
import { OrdenesProduccionV2 } from "@/components/OrdenesProduccionV2";

// Producción del Taller (restaurada 2026-09-15 sobre V2). Una sola forma de
// producir: la orden. Se abre con costo estimado y cantidades por talla-color,
// avanza por etapas y al cerrar confirma cuántas salieron buenas y el costo
// real, que entra al stock del Taller (`cerrar_produccion` → `movimientos`).
// Ver supabase/migrations/20260915120000_produccion_del_taller.sql.
//
// La pantalla es SIEMPRE del Taller, no de la ubicación activa: un líder
// mirando "Tienda Lima" igual ve las órdenes de Lima-Taller, porque es quien
// decide qué se fabrica. Un integrante solo entra si su ubicación es el Taller;
// la base lo vuelve a comprobar en cada RPC (fn_puede_operar_ubicacion).
export default async function ProduccionPage() {
  const persona = await requirePersonaActualV2();
  const esLider = persona.rol === "lider";
  if (!esLider && persona.ubicacionTipo !== "taller") redirect("/");

  const taller = await getTaller();
  if (!taller) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl text-tinta">Producción</h1>
        <p className="card-cayla p-5 text-sm text-tinta/75">
          No hay una ubicación de tipo Taller activa. Producción necesita una para saber dónde entra el stock.
        </p>
      </div>
    );
  }

  const [ordenes, modelos] = await Promise.all([getOrdenesProduccion(taller.id), getModelosProducibles()]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{taller.nombre}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Órdenes de producción</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Abre una orden, márcala avanzar por etapas y ciérrala al inventario cuando esté lista.
        </p>
      </div>

      <OrdenesProduccionV2 tallerId={taller.id} ordenes={ordenes} modelos={modelos} />
    </div>
  );
}
