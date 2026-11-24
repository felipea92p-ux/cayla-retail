import type { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import { leerTicketCompartido, type TicketCompartido } from "@/lib/tickets-compartidos-reglas";

/**
 * Las llamadas de los tickets compartidos (ADR-0701). Cada una devuelve `{ dato }` o `{ error }` sin lanzar: la caja nunca se cae por un
 * ticket que no llegó (principio 9). Las funciones de la base aún no están en los tipos generados, por eso el `as never`.
 */
type Supabase = ReturnType<typeof createClient>;
type ErrorDeLaBase = { message?: string | null; hint?: string | null; code?: string | null };
type Resultado<T> = { dato: T; error: null } | { dato: null; error: ErrorDeLaBase };

const sinRespuesta = { message: "La base no devolvió el ticket." };

/** Manda a la caja de la sede el ticket armado en el piso. El `id` lo elige el equipo: reenviar el mismo no crea otro. */
export async function enviarTicketACaja(
  supabase: Supabase,
  firma: Firma | FirmaOmitida | null,
  t: { id: string; ubicacionId: string; nombre: string; contenido: unknown },
): Promise<Resultado<TicketCompartido>> {
  const { data, error } = await firmar(
    supabase.rpc("enviar_ticket_a_caja" as never, { p_id: t.id, p_ubicacion_id: t.ubicacionId, p_nombre: t.nombre, p_contenido: t.contenido } as never),
    firma,
  );
  if (error) return { dato: null, error };
  const fila = leerTicketCompartido(data);
  return fila ? { dato: fila, error: null } : { dato: null, error: sinRespuesta };
}
