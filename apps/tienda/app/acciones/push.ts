"use server";

import { direccionValida, suscripcionValida } from "@/lib/push";
import { quitarAparato, suscribirAparato } from "@/lib/push-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// Los avisos en el celular (Felipe, 2026-10-20): la persona los activa o los apaga desde «Tus notificaciones». Solo con sesión; el aparato
// se guarda para su cuenta y nadie más. Devuelve si la base lo aceptó: si no, el botón dice que no se pudo y no pasa nada más.

/** Activa los avisos en este aparato. `suscripcion` es lo que dio el navegador (`PushSubscription.toJSON()`), validado aquí. */
export async function activarAvisosEnCelular(suscripcion: unknown): Promise<boolean> {
  const aparato = suscripcionValida(suscripcion);
  if (!aparato) return false;
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  return suscribirAparato(sesion.usuarioId, aparato);
}

/** Apaga los avisos en este aparato (la persona lo quitó, o el navegador revocó el permiso). */
export async function desactivarAvisosEnCelular(endpoint: unknown): Promise<boolean> {
  if (!direccionValida(endpoint)) return false;
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  return quitarAparato(sesion.usuarioId, endpoint);
}
