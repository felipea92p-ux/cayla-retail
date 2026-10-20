import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { TipoAviso } from "@/lib/club-avisos-reglas";

// Las escrituras de Clientas ▸ Avisos desde el navegador (ADR-0288 act. g, contrato de la tanda 1g, función 8). Todas firman con el responsable
// del combo (ADR-0161); la base exige el módulo «avisos_club» para anotar y deshacer. Ninguna decide reglas: solo pasa lo que eligió la
// pantalla. «Beneficios del club» tiene su módulo y su archivo: `club-puntos-acciones.ts`.

/** «Enviar»: WhatsApp Web ya se abrió con el texto; queda anotado quién lo mandó, a quién, qué texto y desde qué tienda. Devuelve el
 *  id del envío, que es lo que pide «Deshacer». */
export async function registrarAvisoEnviado(
  aviso: { clientaId: string; tipo: TipoAviso; referencia: string; texto: string; ubicacionId: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; error: ErrorEscritura }> {
  const supabase = createClient();
  const { data, error } = await firmar(
    supabase.rpc("registrar_aviso_enviado", {
      p_clienta_id: aviso.clientaId,
      p_tipo: aviso.tipo,
      p_referencia: aviso.referencia,
      p_texto: aviso.texto,
      p_ubicacion_id: aviso.ubicacionId,
    }),
    firma,
  );
  return { id: typeof data === "string" ? data : null, error };
}

/** «Deshacer» (dentro de 10 minutos): el aviso vuelve a la lista de por mandar. La base rechaza pasado el plazo. */
export async function deshacerAvisoEnviado(id: string, firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorEscritura }> {
  const supabase = createClient();
  const { error } = await firmar(supabase.rpc("deshacer_aviso_enviado", { p_id: id }), firma);
  return { error };
}

/** «Editar mensajes»: guarda una versión nueva de cada aviso que cambió y del cierre común (`guardar_mensajes_avisos`, solo el
 *  líder). Devuelve cuántos textos cambiaron (0 si no había nada distinto). */
export async function guardarMensajesAvisos(
  cuerpos: Record<TipoAviso, string>,
  cierre: string,
  firma: Firma | FirmaOmitida | null,
): Promise<{ cambiados: number | null; error: ErrorEscritura }> {
  const supabase = createClient();
  const { data, error } = await firmar(supabase.rpc("guardar_mensajes_avisos", { p_mensajes: cuerpos, p_cierre: cierre }), firma);
  return { cambiados: typeof data === "number" ? data : null, error };
}
