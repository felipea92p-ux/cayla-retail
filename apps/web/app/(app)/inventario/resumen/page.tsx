import { redirect } from "next/navigation";
import { exigirModulo, puede } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getComparacionInventario, getDesempenoInventario } from "@/lib/resumen-inventario";
import { pideComparacion } from "@/lib/resumen-comparacion";
import { ResumenBanner } from "@/components/ResumenBanner";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ResumenComparacionPanel } from "@/components/ResumenComparacionPanel";
import { ResumenDesempenoPanel } from "@/components/ResumenDesempenoPanel";

// Análisis de inventario (ADR-0121 → ADR-0138): la capa histórica del inventario de UNA sede. Tres
// responsabilidades, cada una en su pantalla:
//   · Existencias           «¿qué tengo ahora y cómo está el stock?» (incluida su cobertura)
//   · Análisis › Desempeño  «¿cómo se comportó mi inventario durante el período?»
//   · Análisis › Comparar   «¿qué cambió entre dos períodos?» (`?modo=comparar`)
// Esta pantalla NO mezcla el stock de hoy con métricas del período. La ruta sigue siendo
// `/inventario/resumen` (renombrar la URL rompería enlaces y marcadores por nada). Es del módulo Análisis: hasta el
// 2026-09-22 solo del líder; desde 20260923110000, de quien lo tenga en su rol (`fn_puede_analizar`), para SU sede —
// quien no es líder no cambia de sede, así que analiza la suya.
//
// La sede es SIEMPRE la que el líder eligió en el selector global del ERP
// (`persona.ubicacionId`): la pantalla no tiene selector propio. Uno duplicado
// dentro del contenido dejaba dos «Trujillo» que podían decir cosas distintas.
//
// Todo lo demás vive en la URL — período, búsqueda, filtros, orden y página — y el servidor
// recalcula con eso: al navegador nunca viaja más que una página de filas. Esta página solo trae
// datos y elige el layout; las reglas viven en `lib/resumen-desempeno.ts` y `lib/resumen-comparacion.ts`.
export default async function ResumenInventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const persona = await exigirModulo("analisis");
  if (!puede(persona, "analizar")) redirect("/inventario"); // lo ve pero su rol está limitado: sin las lecturas del módulo

  const params = await searchParams;
  const ubicaciones = await getUbicaciones();
  const ubicacionActiva = ubicaciones.find((u) => u.id === persona.ubicacionId);
  if (!ubicacionActiva) redirect("/inventario");

  const { exactitud, panel } = pideComparacion(params)
    ? await getComparacionInventario(ubicacionActiva, params).then((datos) => ({ exactitud: datos.exactitud, panel: <ResumenComparacionPanel datos={datos} /> }))
    : await getDesempenoInventario(ubicacionActiva, params).then((datos) => ({ exactitud: datos.exactitud, panel: <ResumenDesempenoPanel datos={datos} /> }));

  return (
    <div className="space-y-5">
      <CabeceraPantalla
        sobretitulo={`Inventario › Análisis › ${ubicacionActiva.nombre}`}
        titulo="Análisis de inventario"
        bajada="Analiza cómo se mueve y rinde tu inventario a lo largo del tiempo."
        acciones={<ResumenBanner exactitud={exactitud} ubicacionId={ubicacionActiva.id} />}
      />

      {panel}
    </div>
  );
}
