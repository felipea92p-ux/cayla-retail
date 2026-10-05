/**
 * El sonido de «confirmado» (Existencias, 2026-10-05): al colgar en el piso, subir a almacén, ajustar o reportar una dañada, además del aviso
 * verde suena una campanita corta que sube (dos tonos). Quien trabaja en el piso con el cliente enfrente no siempre mira la
 * esquina de la pantalla: el oído le dice «ya quedó».
 *
 * Es una comodidad y puede faltar (sin Web Audio, o si el navegador todavía no dejó sonar, no suena y el guardado no cambia en
 * nada). Se puede apagar por dispositivo (`preferencia-local.ts`): una boutique con música baja no quiere campanitas, y esa
 * decisión es del lugar, no de la cuenta. Distinto del bip del conteo (`sonido-conteo.ts`), que es de lectura con pistola y no se
 * apaga. Mismo motor de audio: `reproducirPatron`.
 */

import { preferenciaLocal } from "./preferencia-local";
import { reproducirPatron, type PatronSonoro } from "./sonido-conteo";

/** Dos tonos que suben: «listo». Más grave y largo que el bip de la pistola, para no confundirse con una lectura. */
export const PATRON_CONFIRMADO: PatronSonoro = { tonos: [[784, 70], [1047, 120]], vibracion: 20 };

/** Primera vez, suena: lo pidió Felipe («incluye sonido al confirmar»); se apaga con el icono de la barra de Existencias. */
export const sonidoConfirmar = preferenciaLocal<"si" | "no">("cayla.sonido-confirmar", ["si", "no"], "si");

/** Al encenderlo suena una vez: así la persona oye cómo es y el navegador ya deja sonar (pidió un toque para hacerlo). */
export function fijarSonidoConfirmar(activo: boolean): void {
  sonidoConfirmar.fijar(activo ? "si" : "no");
  if (activo) reproducirPatron(PATRON_CONFIRMADO);
}

/** Suena y vibra «confirmado», si este equipo lo tiene encendido. Nunca lanza. */
export function sonarConfirmacion(): void {
  if (sonidoConfirmar.leer() === "no") return;
  reproducirPatron(PATRON_CONFIRMADO);
}
