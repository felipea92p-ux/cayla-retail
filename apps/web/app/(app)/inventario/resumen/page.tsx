import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getResumenInventario } from "@/lib/resumen-inventario";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { ResumenBanner } from "@/components/ResumenBanner";
import { ResumenInventarioPanel } from "@/components/ResumenInventarioPanel";

// Resumen de Inventario v2 (2026-09-19, ADR-0113): la capa analítica y de
// decisión del inventario de UNA sede. Existencias responde «¿qué tengo
// físicamente ahora?»; esta pantalla responde «¿cómo se está comportando, qué
// significa y qué conviene hacer?». Solo Líder (es la pregunta de quien decide
// reposición, liquidación y traslados; mismo criterio que Compras), y la sede
// se resuelve igual que en Existencias: `?ubicacion=`, o la de la persona.
//
// Todo lo demás vive en la URL — período, comparación, búsqueda, filtros, orden y
// página — y el servidor recalcula con eso: al navegador nunca viaja más que una
// página de filas. Esta página solo trae datos y elige el layout; las reglas
// viven en `lib/resumen-reglas.ts`.
export default async function ResumenInventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/inventario");

  const params = await searchParams;
  const ubicacionQuery = Array.isArray(params.ubicacion) ? params.ubicacion[0] : params.ubicacion;
  const ubicaciones = await getUbicaciones();
  const ubicacionActivaId =
    ubicacionQuery && ubicaciones.some((u) => u.id === ubicacionQuery) ? ubicacionQuery : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId) ?? ubicaciones[0];
  if (!ubicacionActiva) redirect("/inventario");

  const datos = await getResumenInventario(ubicacionActiva, params);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="label-cayla text-[11px] text-tinta/65">
            Inventario <span aria-hidden>›</span> Resumen <span aria-hidden>›</span> <span className="text-ambar-profundo">{ubicacionActiva.nombre}</span>
          </p>
          <h1 className="font-display mt-1 text-[2rem] leading-tight text-tinta">Resumen de inventario</h1>
          <p className="mt-1 text-sm text-tinta/65">Cómo se está moviendo tu inventario y qué decisiones conviene tomar ahora.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ResumenBanner exactitud={datos.exactitud} ubicacionId={ubicacionActiva.id} ubicacionBaseId={persona.ubicacionId} />
          <SelectorUbicacion ubicaciones={ubicaciones} ubicacionActualId={ubicacionActiva.id} conservarParametros />
        </div>
      </div>

      <ResumenInventarioPanel datos={datos} />
    </div>
  );
}
