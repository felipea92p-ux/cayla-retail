import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller, getOrdenesProduccion, getModelosProducibles } from "@/lib/produccion";
import { OrdenesTablero } from "@/components/OrdenesTablero";
import { hoyLima } from "@/lib/fechas-lima";
import { getInsumosDelTaller } from "@/lib/insumos";

// Órdenes de producción del Taller (restaurada 2026-09-15 sobre V2). Una sola
// forma de producir: la orden. Se abre con costo estimado y cantidades por
// talla-color, avanza por etapas y al cerrar confirma cuántas salieron buenas y
// el costo real, que entra al stock del Taller (`cerrar_produccion` →
// `movimientos`). Ver supabase/migrations/20260915130000_produccion_del_taller.sql.
//
// Vive en `/produccion/ordenes` desde ADR-0133 (F1): `/produccion` pasó a ser el
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

  const esLider = persona.rol === "lider";
  const hoy = hoyLima();
  const [ordenes, modelos, datosInsumos] = await Promise.all([
    getOrdenesProduccion(taller.id),
    getModelosProducibles(),
    getInsumosDelTaller(taller.id, { conCostos: esLider, hoy }),
  ]);

  return (
    <div className="space-y-6">
      <OrdenesTablero tallerId={taller.id} ordenes={ordenes} modelos={modelos} esLider={esLider} hoy={hoy} insumos={datosInsumos.insumos} consumosPorOrden={datosInsumos.consumosPorOrden} />
    </div>
  );
}
