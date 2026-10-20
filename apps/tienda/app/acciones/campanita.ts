"use server";

import { cookies } from "next/headers";
import { borrarAvisos, quitarDeBandeja, vaciarBandeja } from "@/lib/avisos-tienda-servidor";
import { cookiesDeTallasSobrantes } from "@/lib/inicio-aviso";
import { leerSesion } from "@/lib/sesion-servidor";

// Las notificaciones de la campanita y de «Todas las notificaciones» (Felipe, 2026-10-19). Borrar marca la notificación en el historial de
// la cuenta (en la base, con su función de la tienda): no se pierde, pero ya no sale en el panel ni en la pantalla de todas. Lo que se borra no
// cuenta en el globo ni vuelve a avisar en vivo. Lo leído y lo visto al abrir el panel siguen siendo cookies de este aparato.

/** Borra una, varias o todas las notificaciones de la cuenta de quien las pide. `claves`: la lista a borrar, validada por la base (lo que
 *  no tiene forma de notificación no borra nada). Devuelve si la base lo aceptó. */
export async function borrarAvisosDelPanel(claves: unknown): Promise<boolean> {
  if (!Array.isArray(claves) || !claves.every((c): c is string => typeof c === "string") || claves.length === 0) return false;
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  return borrarAvisos(sesion.usuarioId, claves);
}

/** La «×» del panel: quita UNA notificación de la bandeja (sin borrarla: sigue en «Todas las notificaciones»). `claves` validadas por la base. */
export async function quitarDeBandejaDelPanel(claves: unknown): Promise<boolean> {
  if (!Array.isArray(claves) || !claves.every((c): c is string => typeof c === "string") || claves.length === 0) return false;
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  return quitarDeBandeja(sesion.usuarioId, claves);
}

/** «Vaciar bandeja» del panel: quita las notificaciones del panel sin borrarlas (siguen en «Todas las notificaciones»). */
export async function vaciarBandejaDelPanel(): Promise<boolean> {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  return vaciarBandeja(sesion.usuarioId);
}

/** Borra todas las notificaciones de la cuenta de quien lo pide (no solo las de la página que se ve). */
export async function borrarTodasLasNotificaciones(): Promise<boolean> {
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  return borrarAvisos(sesion.usuarioId, "todas");
}

/** Al abrir la campanita: quita las cookies de las tallas que ya no están a favor de la cuenta (se volvieron a acabar). Así, si la talla
 *  vuelve a llegar, avisa como nueva. `activas`: las claves de tallas que llegaron hoy (no las respuestas). Devuelve si borró algo, para que
 *  la página se vuelva a dibujar sin las cookies viejas. */
export async function limpiarTallasSobrantes(activas: unknown): Promise<boolean> {
  if (!Array.isArray(activas) || !activas.every((a): a is string => typeof a === "string")) return false;
  const sesion = await leerSesion();
  if (sesion.estado !== "con_sesion") return false;
  const almacen = await cookies();
  const sobrantes = cookiesDeTallasSobrantes(
    almacen.getAll().map((c) => c.name),
    activas,
    sesion.usuarioId,
  );
  for (const nombre of sobrantes) almacen.delete(nombre);
  return sobrantes.length > 0;
}
