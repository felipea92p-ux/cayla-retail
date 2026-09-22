import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getComparacionInventario, getDesempenoInventario } from "@/lib/resumen-inventario";
import { pideComparacion } from "@/lib/resumen-comparacion";
import { ResumenBanner } from "@/components/ResumenBanner";
import { ResumenComparacionPanel } from "@/components/ResumenComparacionPanel";
import { ResumenDesempenoPanel } from "@/components/ResumenDesempenoPanel";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

// Análisis de inventario (ADR-0121 → ADR-0138): la capa histórica del inventario de UNA sede. Tres
// responsabilidades, cada una en su pantalla:
//   · Existencias           «¿qué tengo ahora y cómo está el stock?» (incluida su cobertura)
//   · Análisis › Desempeño  «¿cómo se comportó mi inventario durante el período?»
//   · Análisis › Comparar   «¿qué cambió entre dos períodos?» (`?modo=comparar`)
// Esta pantalla NO mezcla el stock de hoy con métricas del período. La ruta sigue siendo
// `/inventario/resumen` (renombrar la URL rompería enlaces y marcadores por nada). Solo Líder (es la
// pregunta de quien decide reposición, liquidación y traslados; mismo criterio que Compras).
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
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/inventario");

  const params = await searchParams;
  const ubicaciones = await getUbicaciones();
  const ubicacionActiva = ubicaciones.find((u) => u.id === persona.ubicacionId);
  if (!ubicacionActiva) redirect("/inventario");

  const { exactitud, panel } = pideComparacion(params)
    ? await getComparacionInventario(ubicacionActiva, params).then((datos) => ({ exactitud: datos.exactitud, panel: <ResumenComparacionPanel datos={datos} /> }))
    : await getDesempenoInventario(ubicacionActiva, params).then((datos) => ({ exactitud: datos.exactitud, panel: <ResumenDesempenoPanel datos={datos} /> }));

  return (
    <div className="space-y-5">
      <InventarioHero
        eyebrow={
          <>
            Inventario <span aria-hidden>›</span> Análisis <span aria-hidden>›</span> <span className="text-ambar-profundo">{ubicacionActiva.nombre}</span>
          </>
        }
        titulo="Análisis de inventario"
        descripcion="Analiza cómo se mueve y rinde tu inventario a lo largo del tiempo."
        foto={fotoHeroPorPantalla("analisis")}
        variante="integrado"
      />

      {/* El aviso de exactitud es una advertencia de confianza de datos, no una acción — se queda
          fuera del hero (que ya trae foto detrás) para que se lea completo si tiene dos líneas.
          `ResumenBanner` ya devuelve null cuando no hay nada que avisar, así que este `<div>` nunca
          queda vacío doblando el `space-y-5` de acá arriba. */}
      <div className="flex justify-end">
        <ResumenBanner exactitud={exactitud} ubicacionId={ubicacionActiva.id} />
      </div>

      {panel}
    </div>
  );
}
