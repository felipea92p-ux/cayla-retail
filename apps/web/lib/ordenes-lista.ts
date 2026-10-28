import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_LISTA_DE_ORDENES, leerListaDeOrdenes, type ListaDeOrdenes } from "@/lib/ordenes-lista-reglas";

// La lista de Órdenes del Taller (ADR-0400, actividad 5): lectura del servidor. UNA llamada a `fn_ordenes_produccion_lista` trae, de cada orden, lo mismo que la página de esa orden;
// las filas se arman en `lib/ordenes-lista-reglas.ts` con las mismas reglas. Si algo falla lo dice (principio 9): nunca una lista «vacía» que parezca «no hay órdenes».

type Respuesta = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

const FALLA = "No se pudieron leer las órdenes. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.";

/** Las órdenes del Taller para dibujar la lista. `lista: null` + `falla` = la base no respondió o respondió algo que no se entiende. */
export async function getListaDeOrdenes(tallerId: string, hoy: string): Promise<{ lista: ListaDeOrdenes | null; falla: string | null }> {
  const supabase = await createClient();
  // La RPC es nueva y los tipos generados todavía no la conocen: se llama por su constante y se valida en `leerListaDeOrdenes`.
  const { data, error } = await (supabase.rpc(RPC_LISTA_DE_ORDENES as never, { p_ubicacion_id: tallerId } as never) as unknown as Respuesta);
  if (error) {
    console.error(`${RPC_LISTA_DE_ORDENES}: ${error.message}`);
    return { lista: null, falla: FALLA };
  }
  const lista = leerListaDeOrdenes(data, hoy);
  return lista ? { lista, falla: null } : { lista: null, falla: FALLA };
}
