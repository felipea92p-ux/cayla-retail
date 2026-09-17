import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getResumenInventario } from "@/lib/resumen-inventario";
import { ResumenInventarioPanel } from "@/components/ResumenInventarioPanel";

// Resumen de Inventario (2026-09-17, ADR-0097): pantalla de decisión a
// nivel RED completa, no por sede — por eso, a diferencia de Existencias,
// no tiene selector de sede. Solo Líder: es la pregunta de quien decide
// reposición/liquidación/traslados, no la de un colaborador de piso (mismo
// criterio que Compras/Colaboradores).
export default async function ResumenInventarioPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/inventario");

  const ubicaciones = await getUbicaciones();
  const resumen = await getResumenInventario(ubicaciones);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-medium text-tinta">Resumen</h1>
        <p className="text-sm text-tinta/55">
          Cómo está el inventario en conjunto y qué conviene decidir hoy — a nivel de toda la red.
        </p>
      </div>
      <ResumenInventarioPanel
        productos={resumen.productos}
        curvasIncompletas={resumen.curvasIncompletas}
        sugerenciasTraslado={resumen.sugerenciasTraslado}
      />
    </div>
  );
}
