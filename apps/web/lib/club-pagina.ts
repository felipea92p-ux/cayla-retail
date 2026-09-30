import "server-only";
import { crearClienteAnonimo } from "@/lib/supabase/anonimo";
import { tokenValido } from "@/lib/club-reglas";
import { vistaDeInvitacion, type VistaInvitacion } from "@/lib/club-pagina-reglas";

// La lectura de la página pública del club (ADR-0288 act. c), del lado del servidor y como `anon`. La usan la página
// (`app/club/[token]/page.tsx`) y su acción al releer el texto cuando cambió (`app/actions/club.ts`).

/**
 * La invitación de este enlace, lista para mostrar. Un token con forma inválida ni se consulta («no es válido»). Si la
 * base no responde, la página dice «no pudimos abrirla» en vez de caerse (principio 9): nunca inventa un estado.
 */
export async function leerInvitacionClub(token: string): Promise<VistaInvitacion> {
  if (!tokenValido(token)) return { estado: "no_existe" };
  try {
    const { data, error } = await crearClienteAnonimo().rpc("fn_invitacion_club", { p_token: token });
    if (error) {
      // Sin el token en el registro: basta el código para diagnosticar y el enlace es de un solo uso de ella.
      console.error("[club] fn_invitacion_club falló", error.code, error.message);
      return { estado: "no_disponible" };
    }
    return vistaDeInvitacion(Array.isArray(data) ? data[0] : null);
  } catch (e) {
    console.error("[club] fn_invitacion_club no respondió", e instanceof Error ? e.message : e);
    return { estado: "no_disponible" };
  }
}
