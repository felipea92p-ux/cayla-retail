import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerNosDebe, leerResumenNosDebe, RPC_NOS_DEBE, RPC_NOS_DEBE_RESUMEN, type NosDebe, type ResumenNosDebe } from "@/lib/nos-debe-reglas";

// «Nos debe» (ADR-0362, fase 5a): lo que la pantalla lee en el servidor. Las reglas viven en la base (`fn_proveedor_nos_debe` y
// `fn_nos_debe_resumen` piden Proveedores, la plata de Compras u Órdenes de compra). Es secundario en las dos pantallas que lo usan (la ficha
// del proveedor y la orden nueva): si la base todavía no tiene la función (la web publicada antes que la migración), la pantalla sigue como
// antes, sin decir nada; si respondió con un error, la ficha lo dice (principio 9: nunca un «no te debe nada» que sea mentira).

type Respuesta = { data: unknown; error: { message: string; code?: string } | null };

async function rpc(nombre: string, args?: Record<string, unknown>): Promise<Respuesta> {
  const supabase = await createClient();
  return (await (supabase.rpc(nombre as never, (args ?? {}) as never) as unknown as PromiseLike<Respuesta>)) as Respuesta;
}

/** ¿La base todavía no tiene esa función? (la web publicada antes que la migración). */
const faltaLaFuncion = (e: { message: string; code?: string } | null): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message));

export const FALLA_NOS_DEBE = "No se pudo leer lo que este proveedor te debe por reponer. Vuelve a cargar la página en un momento; si sigue, avísale a tu líder.";

/**
 * Lo que un proveedor le debe a CAYLA en prendas: las deudas abiertas y las cerradas de los últimos 90 días. `nosDebe: null` y `falla: null` =
 * la base todavía no lo sabe contar (la ficha sale sin esa parte); `falla` = la base no respondió (la ficha lo dice).
 */
export async function getNosDebeProveedor(proveedorId: string): Promise<{ nosDebe: NosDebe | null; falla: string | null }> {
  const res: Respuesta = await rpc(RPC_NOS_DEBE, { p_proveedor_id: proveedorId }).catch((e: unknown) => ({ data: null, error: { message: String(e) } }));
  // Sin la función (la web antes que la migración) o sin el permiso de la base (42501): la ficha sale como antes, sin esa parte.
  if (faltaLaFuncion(res.error) || res.error?.code === "42501") return { nosDebe: null, falla: null };
  if (res.error) {
    console.error(`${RPC_NOS_DEBE}: ${res.error.message}`);
    return { nosDebe: null, falla: FALLA_NOS_DEBE };
  }
  const nosDebe = leerNosDebe(res.data);
  return nosDebe ? { nosDebe, falla: null } : { nosDebe: null, falla: FALLA_NOS_DEBE };
}

/** Por proveedor, lo que debe por reponer (`fn_nos_debe_resumen`): el aviso de la orden nueva. Un adorno: si no responde, `null` y la orden
 *  se llena igual, sin el aviso. */
export async function getNosDebeResumen(): Promise<Record<string, ResumenNosDebe> | null> {
  const res: Respuesta = await rpc(RPC_NOS_DEBE_RESUMEN).catch((e: unknown) => ({ data: null, error: { message: String(e) } }));
  if (res.error) {
    if (!faltaLaFuncion(res.error)) console.error(`${RPC_NOS_DEBE_RESUMEN}: ${res.error.message}`);
    return null;
  }
  return leerResumenNosDebe(res.data);
}
