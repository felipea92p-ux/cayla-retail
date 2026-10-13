import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  RPC_FONDOS,
  RPC_MOVIMIENTOS_FONDOS,
  RPC_OPCIONES_FONDOS,
  leerFondos,
  leerMovimientosFondos,
  leerOpcionesFondos,
  type FondoFila,
  type MovimientoFondo,
  type OpcionesFondos,
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
