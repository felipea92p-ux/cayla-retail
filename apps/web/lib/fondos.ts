import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  RPC_FONDOS,
  RPC_MI_FONDO_RESUMEN,
  RPC_MOVIMIENTOS_FONDOS,
  RPC_OPCIONES_FONDOS,
  leerFondos,
  leerMovimientosFondos,
  leerOpcionesFondos,
  leerResumenMiFondo,
  type FondoFila,
  type MovimientoFondo,
  type OpcionesFondos,
  type ResumenMiFondo,
} from "@/lib/fondos-reglas";

// Fondos por rendir (ADR-0362, fase 6 · actividad 1): lectura del servidor, por las funciones de 20261013182000. Todas piden el módulo
// `fondos`. Si una lectura falla —la web publicada antes que la migración, o la base caída—, lo dice (principio 9): nunca una lista
// vacía que parezca «nadie tiene plata».

// Las RPC son nuevas y los tipos generados todavía no las conocen: se leen como `unknown` y se validan en `fondos-reglas.ts`.
type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

const FALLA = "No se pudieron leer los fondos. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.";

export type DatosFondos = {
  fondos: FondoFila[];
  movimientos: MovimientoFondo[];
  opciones: OpcionesFondos;
  falla: string | null;
};

/** Todo lo que la pantalla necesita, en paralelo. Con una sola lectura caída, la pantalla dice que falló (no muestra a medias). */
export async function getDatosFondos(): Promise<DatosFondos> {
  const supabase = await createClient();
  const [f, m, o] = await Promise.all([
    supabase.rpc(RPC_FONDOS as never) as unknown as Respuesta,
    supabase.rpc(RPC_MOVIMIENTOS_FONDOS as never, { p_persona_id: null, p_limite: 200 } as never) as unknown as Respuesta,
    supabase.rpc(RPC_OPCIONES_FONDOS as never) as unknown as Respuesta,
  ]);
  const error = f.error ?? m.error ?? o.error;
  if (error) {
    console.error(`fondos por rendir: ${error.message}`);
    return { fondos: [], movimientos: [], opciones: { yo: null, personas: [], cuentas: [] }, falla: FALLA };
  }
  return { fondos: leerFondos(f.data), movimientos: leerMovimientosFondos(m.data), opciones: leerOpcionesFondos(o.data), falla: null };
}

/**
 * «Tu fondo» de quien mira (actividad 4, `fn_mi_fondo_resumen`): sin módulo, es lo suyo. `null` si no tiene fondo, si es una terminal o
 * si la lectura falló. Una falla se registra y la tarjeta no sale: la mayoría de las personas no tiene fondo, y pintarles a todos «no se
 * pudo leer tu fondo» por una base caída sería avisar de algo que no tienen (principio 9: se degrada, nunca muestra un número falso).
 */
export async function getResumenMiFondo(): Promise<ResumenMiFondo | null> {
  const supabase = await createClient();
  const r = await (supabase.rpc(RPC_MI_FONDO_RESUMEN as never) as unknown as Respuesta);
  if (r.error) {
    console.error(`tu fondo: ${r.error.message}`);
    return null;
  }
  return leerResumenMiFondo(r.data);
}
