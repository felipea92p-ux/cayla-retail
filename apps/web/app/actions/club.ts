"use server";

import { crearClienteAnonimo } from "@/lib/supabase/anonimo";
import { tokenValido } from "@/lib/club-reglas";
import { leerInvitacionClub } from "@/lib/club-pagina";
import { resultadoConfirmacion, type RespuestaConfirmar } from "@/lib/club-pagina-reglas";

/**
 * «Confirmar» en la página pública del QR (ADR-0288 act. c): ella marcó la casilla en su celular y la base registra su
 * permiso de publicidad (medio `qr_web`, sin `registrado_por`: el acto es de ella).
 *
 * Es PÚBLICA a propósito: la llama una clienta sin cuenta y viaja como POST a `/club/<token>`, que `proxy.ts` deja
 * pasar sin sesión. Por eso no confía en nada de lo que llega (los argumentos de una acción los puede mandar cualquiera):
 * valida la forma del token y de la versión, y corre como `anon` (`crearClienteAnonimo`), sin la sesión que pudiera
 * tener el aparato. Lo que de verdad protege es la base: `confirmar_invitacion_club` exige una invitación vigente, sin
 * usar, de una socia sin anonimizar, bloquea la fila (`for update`) y rechaza si el texto cambió (`club_texto_cambio`).
 */
export async function confirmarPublicidadClub(token: string, textoVersion: number): Promise<RespuestaConfirmar> {
  if (typeof token !== "string" || !tokenValido(token)) return { resultado: "no_existe" };
  if (typeof textoVersion !== "number" || !Number.isInteger(textoVersion) || textoVersion <= 0) return { resultado: "error" };
  try {
    const { data, error } = await crearClienteAnonimo().rpc("confirmar_invitacion_club", {
      p_token: token,
      p_texto_version: textoVersion,
    });
    if (error && error.hint !== "club_texto_cambio") console.error("[club] confirmar_invitacion_club falló", error.code, error.message);
    const resultado = resultadoConfirmacion({ estado: data, hint: error?.hint, hayError: error !== null });
    // El texto cambió mientras lo leía: se relee aquí mismo para que la página muestre el nuevo sin recargar.
    if (resultado === "texto_cambio") return { resultado, vista: await leerInvitacionClub(token) };
    return { resultado };
  } catch (e) {
    console.error("[club] confirmar_invitacion_club no respondió", e instanceof Error ? e.message : e);
    return { resultado: "error" };
  }
}
