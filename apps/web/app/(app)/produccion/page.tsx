import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller, getOrdenesProduccion, getModelosProducibles } from "@/lib/produccion";
import { OrdenesProduccionV2 } from "@/components/OrdenesProduccionV2";

// Producción del Taller (restaurada 2026-09-15 sobre V2). Una sola forma de
// producir: la orden. Se abre con costo estimado y cantidades por talla-color,
// avanza por etapas y al cerrar confirma cuántas salieron buenas y el costo
// real, que entra al stock del Taller (`cerrar_produccion` → `movimientos`).
// Ver supabase/migrations/20260915130000_produccion_del_taller.sql.
//
// Se entra solo parado EN el Taller (revertido 2026-09-17, pedido de
// Felipe): la excepción de líder-desde-cualquier-ubicación duraba dos días
// y dejaba entrar por URL directa aunque el AppShell ya no mostrara el
// link — dos partes del sistema decidiendo lo mismo de dos formas. La base
// lo vuelve a comprobar en cada RPC (fn_puede_operar_ubicacion) de todos modos.
export default async function ProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (persona.ubicacionTipo !== "taller") redirect("/");

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
