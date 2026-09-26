import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { EnvioDeLote, TrasladoEnCamino } from "@/lib/envio-reglas";

// Lecturas del servidor para el envío (ADR-0113). Lo que se cuenta y se manda a `recibir_envio` vive
// en `envio-reglas.ts` (puro); acá solo lo que hay que ir a buscar.

type FilaTraslado = {
  id: string;
  numero: number;
  ubicacion_destino_id: string;
  fecha_estimada_llegada: string | null;
  nota: string | null;
  origen: { nombre: string } | null;
};

/**
 * Los traslados EN TRÁNSITO que vienen hacia cada ubicación pedida, con lo que el origen dice que mandó.
 * Son el «envío interno»: mercadería de otra sede de CAYLA que puede llegar en el mismo envío que la de un
 * proveedor. Se cuentan y confirman dentro del envío (`recibir_envio` → `confirmar_traslado`, ADR-0068) — no
 * entran como prendas sueltas, porque el stock del origen ya bajó al enviarlos. Solo los `en_transito`: uno
 * con diferencia ya está esperando a un líder y no se cuenta de nuevo.
 */
export async function getTrasladosHaciaAca(ubicacionIds: string[]): Promise<Record<string, TrasladoEnCamino[]>> {
  const porUbicacion: Record<string, TrasladoEnCamino[]> = Object.fromEntries(ubicacionIds.map((id) => [id, []]));
  if (ubicacionIds.length === 0) return porUbicacion;

  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("transferencias")
      .select(`id, numero, ubicacion_destino_id, fecha_estimada_llegada, nota, origen:ubicaciones!transferencias_ubicacion_origen_id_fkey ( nombre )`)
      .in("ubicacion_destino_id", ubicacionIds)
      .eq("estado", "en_transito")
      .order("fecha_estimada_llegada", { ascending: true }),
    "los traslados que vienen en camino",
  ) as unknown as FilaTraslado[];

  const lineas = await Promise.all(filas.map((f) => supabase.rpc("fn_traslado_lineas", { p_transferencia_id: f.id })));
  filas.forEach((f, i) => {
    porUbicacion[f.ubicacion_destino_id]?.push({
      id: f.id,
      numero: f.numero,
      origenNombre: f.origen?.nombre ?? "—",
      fechaEstimadaLlegada: f.fecha_estimada_llegada,
      nota: f.nota,
      lineas: exigir(lineas[i], "las líneas del traslado").map((l) => ({
        varianteId: l.variante_id,
        sku: l.sku,
        referencia: l.referencia,
        talla: l.talla,
        color: l.color,
        cantidadEnviada: l.cantidad_enviada ?? 0,
      })),
    });
  });
  return porUbicacion;
}

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
