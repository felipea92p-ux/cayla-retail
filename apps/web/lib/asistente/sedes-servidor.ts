import "server-only";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerSedesAsistente, type SedeAsistente } from "@/lib/asistente/sedes";

// «Pregúntale a CAYLA» en cada sede (ADR-0536, actividad 8): lo que lee el servidor. Todo es total (nunca lanza): el layout de la app
// pregunta por la sede en cada pantalla, y un error aquí no puede dejar a nadie sin ERP por un botón de ayuda.

/** ¿Sale el botón «Preguntar»? `ubicacionId` null = CAYLA Global (sale si alguna sede lo tiene). Si la base no responde o todavía no
 *  tiene la función (web publicada antes de pegar 20261027163000), sale APAGADO: el piloto es de una sede y nadie gasta sin querer. */
export async function getAsistenteEncendido(ubicacionId: string | null): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_asistente_encendido" as never, { p_ubicacion_id: ubicacionId } as never);
    return !error && (data as unknown) === true;
  } catch (e) {
    unstable_rethrow(e); // lo que es de Next (página dinámica, redirect) sigue su camino; un error de verdad deja el botón apagado
    return false;
  }
}

/** Las sedes con su interruptor y lo gastado en el mes, para Configuración. `null` si la base todavía no tiene la función: la
 *  tarjeta no se dibuja. El gasto es `null` si no se pudo leer (la tarjeta sale sin él). */
export async function getAsistenteSedes(): Promise<{ sedes: SedeAsistente[]; gastado: number | null } | null> {
  const supabase = await createClient();
  const [sedes, gasto] = await Promise.all([supabase.rpc("fn_asistente_sedes" as never), supabase.rpc("fn_asistente_gasto_del_mes" as never)]);
  if (sedes.error) return null;
  return { sedes: leerSedesAsistente(sedes.data), gastado: gasto.error ? null : Number(gasto.data) };
}
