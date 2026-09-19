import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { TrasladoEnCamino } from "@/lib/envio-reglas";

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
