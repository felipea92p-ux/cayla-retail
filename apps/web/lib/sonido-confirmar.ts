/**
 * El sonido de «confirmado» (Existencias, 2026-10-05): al reponer, retirar del piso, ajustar o reportar una dañada, además del aviso
 * verde suena una campanita corta que sube (dos tonos). Quien trabaja en el piso con el cliente enfrente no siempre mira la
 * esquina de la pantalla: el oído le dice «ya quedó».
 *
 * Es una comodidad y puede faltar (sin Web Audio, o si el navegador todavía no dejó sonar, no suena y el guardado no cambia en
 * nada). Se puede apagar por dispositivo: una boutique con música baja no quiere campanitas, y esa decisión es del lugar, no de la
 * cuenta. Por eso vive en `localStorage` de cada equipo y no en la base. Distinto del bip del conteo (`sonido-conteo.ts`), que es
 * de lectura con pistola y no se apaga. Mismo motor de audio: `reproducirPatron`.
 */

import { reproducirPatron, type PatronSonoro } from "./sonido-conteo";

export const CLAVE_SONIDO_CONFIRMAR = "cayla.sonido-confirmar";

/** Dos tonos que suben: «listo». Más grave y largo que el bip de la pistola, para no confundirse con una lectura. */
export const PATRON_CONFIRMADO: PatronSonoro = { tonos: [[784, 70], [1047, 120]], vibracion: 20 };

/** Lo guardado en este equipo: sin nada guardado (primera vez) suena. Solo «0» lo apaga. */
export function sonidoConfirmarActivo(guardado: string | null | undefined): boolean {
  return guardado !== "0";
}

const oyentes = new Set<() => void>();

/** ¿Suena en este equipo? En el servidor, sí (el valor real se lee en el navegador). */
export function leerSonidoConfirmar(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sonidoConfirmarActivo(window.localStorage.getItem(CLAVE_SONIDO_CONFIRMAR));
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): suena y no se puede apagar; no es un error.
    return true;
  }
}

export function fijarSonidoConfirmar(activo: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_SONIDO_CONFIRMAR, activo ? "1" : "0");
  } catch {
    // No se pudo guardar: vale para esta visita.
  }
  oyentes.forEach((o) => o());
  // Al encenderlo suena una vez: así la persona oye cómo es y el navegador ya deja sonar (pidió un toque para hacerlo).
  if (activo) reproducirPatron(PATRON_CONFIRMADO);
}

/** Para `useSyncExternalStore`: avisa cuando cambia en esta pestaña o en otra. */
export function suscribirSonidoConfirmar(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  const entre = (e: StorageEvent) => {
    if (e.key === CLAVE_SONIDO_CONFIRMAR) alCambiar();
  };
  window.addEventListener("storage", entre);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", entre);
  };
}

/** Suena y vibra «confirmado», si este equipo lo tiene encendido. Nunca lanza. */
export function sonarConfirmacion(): void {
  if (!leerSonidoConfirmar()) return;
  reproducirPatron(PATRON_CONFIRMADO);
}
