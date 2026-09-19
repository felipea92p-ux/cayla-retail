import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller, getOrdenesProduccion, getModelosProducibles } from "@/lib/produccion";
import { OrdenesProduccionV2 } from "@/components/OrdenesProduccionV2";

// Órdenes de producción del Taller (restaurada 2026-09-15 sobre V2). Una sola
// forma de producir: la orden. Se abre con costo estimado y cantidades por
// talla-color, avanza por etapas y al cerrar confirma cuántas salieron buenas y
// el costo real, que entra al stock del Taller (`cerrar_produccion` →
// `movimientos`). Ver supabase/migrations/20260915130000_produccion_del_taller.sql.
//
// Vive en `/produccion/ordenes` desde ADR-0130 (F1): `/produccion` pasó a ser el
// módulo padre y hoy redirige acá. Quién entra (D-A, reemplaza la regla del
// 2026-09-17 «solo parado en el Taller, líder incluido»): el líder desde
// cualquier ubicación —la base ya lo permite: `fn_puede_operar_ubicacion` es
// «líder o mi ubicación»— y quien trabaja en el Taller. El candado real sigue
// siendo el de cada RPC.
export default async function OrdenesProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider" && persona.ubicacionTipo !== "taller") redirect("/");

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
