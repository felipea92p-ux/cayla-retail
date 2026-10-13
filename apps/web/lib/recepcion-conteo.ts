import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  leerConteosDelEnvio,
  leerPendientesDeLaSede,
  RPC_CONTEOS_ENVIO,
  RPC_PENDIENTES_SEDE,
  type ConteosDelEnvio,
  type PendientesDeLaSede,
} from "@/lib/recepcion-conteo-reglas";

// Recibir contando primero (ADR-0393): lo que la cara A lee en el servidor. La web puede publicarse antes que las migraciones de ADR-0393
// (se pegan con el OK de Felipe): si la base todavía no tiene la función, la lectura lo dice (`soportado: false`) y la pantalla sigue con la
// recepción de la fase 4, que sí está en producción (principio 9: nunca un formulario que falle al guardar).

type Respuesta = { data: unknown; error: { message: string; code?: string } | null };

async function rpc(nombre: string, args: Record<string, unknown>): Promise<Respuesta> {
  const supabase = await createClient();
  return (await (supabase.rpc(nombre as never, args as never) as unknown as PromiseLike<Respuesta>)) as Respuesta;
}

/** ¿La base todavía no tiene esa función? (la web publicada antes que la migración). */
const faltaLaFuncion = (e: { message: string; code?: string } | null): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message));

/** Lo contado de un envío. `soportado: false` = la base no tiene ADR-0393 (la pantalla usa la recepción de la fase 4). */
export async function getConteosDelEnvio(despachoId: string): Promise<{ soportado: boolean; conteos: ConteosDelEnvio | null; falla: string | null }> {
  try {
    const r = await rpc(RPC_CONTEOS_ENVIO, { p_despacho_id: despachoId });
    if (faltaLaFuncion(r.error)) return { soportado: false, conteos: null, falla: null };
    if (r.error) {
      console.error(`${RPC_CONTEOS_ENVIO}: ${r.error.message}`);
      return { soportado: true, conteos: null, falla: "No se pudo leer lo contado de este envío. Recarga en un momento." };
    }
    return { soportado: true, conteos: leerConteosDelEnvio(r.data), falla: null };
  } catch (e) {
    console.error(`${RPC_CONTEOS_ENVIO}: ${String(e)}`);
    return { soportado: true, conteos: null, falla: "No se pudo leer lo contado de este envío. Recarga en un momento." };
  }
}

/**
 * Lo recibido en una sede que todavía no está en el stock (el número de la decisión 4). `null` si la base no lo sabe todavía o no responde:
 * el aviso no sale, y nada más deja de funcionar.
 */
export async function getPendientesDeLaSede(ubicacionId: string): Promise<PendientesDeLaSede | null> {
  try {
    const r = await rpc(RPC_PENDIENTES_SEDE, { p_ubicacion_id: ubicacionId });
    if (r.error) {
      if (!faltaLaFuncion(r.error)) console.error(`${RPC_PENDIENTES_SEDE}: ${r.error.message}`);
      return null;
    }
    return leerPendientesDeLaSede(r.data);
  } catch (e) {
    console.error(`${RPC_PENDIENTES_SEDE}: ${String(e)}`);
    return null;
  }
}

/** ¿La base ya sabe abrir un envío sin aviso? Lo dice `fn_recepcion_pendientes` (llegan juntas con ADR-0393). */
export async function recibirContandoDisponible(ubicacionId: string): Promise<{ disponible: boolean; pendientes: PendientesDeLaSede | null }> {
  try {
    const r = await rpc(RPC_PENDIENTES_SEDE, { p_ubicacion_id: ubicacionId });
    if (faltaLaFuncion(r.error)) return { disponible: false, pendientes: null };
    return { disponible: true, pendientes: r.error ? null : leerPendientesDeLaSede(r.data) };
  } catch {
    return { disponible: false, pendientes: null };
  }
}
