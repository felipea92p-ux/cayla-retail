import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_TELA_DEL_TALLER, leerTelaDelTaller, type TelaDelTallerLeida } from "@/lib/tela-del-taller-reglas";

// La tela del Taller para el Resumen (ADR-0400, actividad 8d): lectura del servidor. Es un dato de apoyo de «¿Alcanza la tela?»: si falla NO tumba la pantalla —devuelve `null` y el Resumen cuenta con el
// rendimiento medido de siempre— y lo dice en el log (principio 9).

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function getTelaDelTaller(tallerId: string): Promise<TelaDelTallerLeida | null> {
  const supabase = await createClient();
  // La función es nueva y los tipos generados todavía no la conocen (se regeneran con el volcado).
  const r = await (supabase.rpc(RPC_TELA_DEL_TALLER as never, { p_ubicacion_id: tallerId } as never) as unknown as Respuesta);
  if (r.error) {
    console.error(`${RPC_TELA_DEL_TALLER}: ${r.error.message}`);
    return null;
  }
  return leerTelaDelTaller(r.data);
}
