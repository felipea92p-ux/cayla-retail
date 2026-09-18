import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getResumenInventario } from "@/lib/resumen-inventario";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { ResumenInventarioPanel } from "@/components/ResumenInventarioPanel";

// Resumen de Inventario (2026-09-17, ADR-0097): la quinta pestaña. Responde
// "¿cómo está mi inventario en conjunto, qué necesita atención hoy y qué
// decisiones conviene tomar ahora?" para UNA sede — la seleccionada, con el
// mismo selector y la misma regla de Existencias (un líder elige, un
// integrante ve la suya). Solo Líder: es la pregunta de quien decide
// reposición, liquidación y traslados, no la del piso (mismo criterio que
// Compras). Esta página solo trae datos y elige el layout; las reglas viven
// en `lib/resumen-reglas.ts`.
export default async function ResumenInventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ubicacion?: string }>;
}) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/inventario");

  const { ubicacion: ubicacionQuery } = await searchParams;
  const ubicaciones = await getUbicaciones();
  const ubicacionActivaId =
    ubicacionQuery && ubicaciones.some((u) => u.id === ubicacionQuery) ? ubicacionQuery : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId) ?? ubicaciones[0];
  if (!ubicacionActiva) redirect("/inventario");

  const resumen = await getResumenInventario(ubicacionActiva);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · Resumen · {ubicacionActiva.nombre}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Resumen de inventario</h1>
          <p className="mt-1 text-sm text-tinta/65">
            El estado general del inventario, qué necesita atención hoy y qué decisiones conviene tomar ahora.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SelectorUbicacion ubicaciones={ubicaciones} ubicacionActualId={ubicacionActiva.id} />
        </div>
      </div>

      <ResumenInventarioPanel resumen={resumen} ubicacionId={ubicacionActiva.id} ubicacionBaseId={persona.ubicacionId} />
    </div>
  );
}
