import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_ORDEN_PRODUCCION, RPC_TELA_PENDIENTE, leerOrdenPagina, numeroDeOrdenEnUrl, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// La página de una orden de producción (ADR-0400, actividad 3): lectura del servidor. Dos pasos: el número de la URL (`OP-000067`) se resuelve al id de la orden y `fn_orden_produccion`
// trae TODO lo que la página dibuja (orden, fases, tela, costos, línea de tiempo y permisos) en una sola lectura. Si algo falla lo dice (principio 9): nunca una orden "vacía" que
// parezca "no hay nada".

type Respuesta = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
type BuscaPorNumero = {
  select: (columnas: string) => { eq: (columna: string, valor: number) => { maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: { message: string; code?: string } | null }> } };
};

const FALLA = "No se pudo leer la orden. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.";

/**
 * La orden que la URL nombra, lista para dibujar. `orden: null` y `falla: null` = esa orden no existe (o esta cuenta no la puede leer: la base responde igual en los dos casos, para
 * no confirmar qué órdenes hay); `falla` = la base no respondió.
 */
export async function getOrdenProduccionPagina(segmento: string): Promise<{ orden: OrdenPagina | null; falla: string | null }> {
  const numero = numeroDeOrdenEnUrl(segmento);
  if (numero === null) return { orden: null, falla: null };
  const supabase = await createClient();
  // `producciones.numero` es nueva (migración 20261014154000) y los tipos generados todavía no la traen: la consulta se tipa a mano, como `insumos` en lib/insumos.ts.
  const { data: fila, error: errorId } = await (supabase.from("producciones") as unknown as BuscaPorNumero).select("id").eq("numero", numero).maybeSingle();
  if (errorId) {
    console.error(`producciones.numero ${numero}: ${errorId.message}`);
    return { orden: null, falla: FALLA };
  }
  if (!fila) return { orden: null, falla: null };
  // La RPC es nueva y los tipos generados todavía no la conocen: se llama por su constante y se valida en `leerOrdenPagina`.
  const { data, error } = await (supabase.rpc(RPC_ORDEN_PRODUCCION as never, { p_produccion_id: fila.id } as never) as unknown as Respuesta);
  if (error) {
    console.error(`${RPC_ORDEN_PRODUCCION}: ${error.message}`);
    return { orden: null, falla: FALLA };
  }
  if (data === null) return { orden: null, falla: null };
  // Lo que otras órdenes reservan de cada tela y lo pedido (actividad 7): dato secundario; sin él, «alcanza» se mide contra todo el estante.
  const pendiente = await (supabase.rpc(RPC_TELA_PENDIENTE as never, { p_produccion_id: fila.id } as never) as unknown as Respuesta);
  const telaPendiente = pendiente.error ? null : pendiente.data;
  if (pendiente.error) console.error(`${RPC_TELA_PENDIENTE}: ${pendiente.error.message}`);
  const orden = leerOrdenPagina(typeof data === "object" && data !== null ? { ...(data as Record<string, unknown>), tela_pendiente: telaPendiente } : data);
  // Una respuesta que no se parece a una orden es una falla de lectura, no una orden inexistente: decir «no existe» escondería un problema.
  return orden ? { orden, falla: null } : { orden: null, falla: FALLA };
}
