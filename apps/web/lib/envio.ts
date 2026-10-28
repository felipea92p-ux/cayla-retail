import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { EnvioDeLote } from "@/lib/envio-reglas";

// Lecturas del servidor para el envío (ADR-0113). Lo que se cuenta y se manda a `recibir_envio` vive
// en `envio-reglas.ts` (puro); acá solo lo que hay que ir a buscar.
//
// Los traslados en camino ya no se leen acá (ADR-0299): se reciben en Traslados, y el aviso de Recibir mercadería usa
// `getTrasladosEnCurso` de `lib/traslados.ts`, la misma lectura de Inicio y Existencias.

/**
 * A qué envío pertenece cada lote de una lista de recepciones, con cuántos lotes y proveedores trajo ESE envío en total
 * (no solo los que caben en la página): con eso «Recibidas» agrupa las filas de una misma llegada bajo una cabecera
 * (`agruparPorEnvio`). Sin migración: `lotes.envio_id` ya existe y sus políticas son las de siempre (quien opera la sede).
 * Los lotes de antes de los envíos no aparecen en el resultado.
 */
export async function getEnviosDeLotes(loteIds: string[]): Promise<Record<string, EnvioDeLote>> {
  const resultado: Record<string, EnvioDeLote> = {};
  if (loteIds.length === 0) return resultado;

  const supabase = await createClient();
  const propios = exigir(await supabase.from("lotes").select("id, envio_id").in("id", loteIds).not("envio_id", "is", null), "los envíos de las recepciones");
  const envioIds = [...new Set(propios.map((l) => l.envio_id).filter((e): e is string => !!e))];
  if (envioIds.length === 0) return resultado;

  const [envios, hermanos] = await Promise.all([
    supabase.from("envios").select("id, numero_guia").in("id", envioIds),
    supabase.from("lotes").select("id, envio_id, proveedor_id").in("envio_id", envioIds),
  ]);
  const guiaPorEnvio = new Map(exigir(envios, "los envíos").map((e) => [e.id, e.numero_guia]));
  const porEnvio = new Map<string, { lotes: Set<string>; proveedores: Set<string> }>();
  for (const l of exigir(hermanos, "los lotes de cada envío")) {
    if (!l.envio_id) continue;
    const acumulado = porEnvio.get(l.envio_id) ?? { lotes: new Set<string>(), proveedores: new Set<string>() };
    acumulado.lotes.add(l.id);
    acumulado.proveedores.add(l.proveedor_id);
    porEnvio.set(l.envio_id, acumulado);
  }

  for (const l of propios) {
    if (!l.envio_id) continue;
    const total = porEnvio.get(l.envio_id);
    resultado[l.id] = {
      envioId: l.envio_id,
      numeroGuia: guiaPorEnvio.get(l.envio_id) ?? null,
      lotes: total?.lotes.size ?? 1,
      proveedores: total?.proveedores.size ?? 1,
    };
  }
  return resultado;
}
