/**
 * El bip del conteo (parte 1 de Conteo conectado, 2026-09-26): con la pistola o la cámara se mira el rack, no la
 * pantalla, así que cada lectura dice con el oído y con la vibración qué pasó (`PATRON_SONIDO` en `conteo-conectado.ts`).
 *
 * Todo es una comodidad y puede faltar: sin Web Audio (o si el navegador todavía no dejó sonar porque nadie tocó la
 * pantalla) no suena, y sin `navigator.vibrate` (iPhone) no vibra. El conteo funciona igual. Solo corre en el navegador.
 */

import { PATRON_SONIDO, type SonidoLectura } from "./conteo-conectado";

let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Clase = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return null;
    contexto ??= new Clase();
    // Un contexto nace «suspendido» hasta que la persona toca algo; cada lectura llega tras un toque o una tecla.
    if (contexto.state === "suspended") void contexto.resume().catch(() => undefined);
    return contexto;
  } catch {
    return null;
  }
}

/** Suena y vibra según lo que pasó con la lectura. Nunca lanza. */
export function avisarLectura(sonido: SonidoLectura): void {
  const patron = PATRON_SONIDO[sonido];
  try {
    navigator.vibrate?.(patron.vibracion);
  } catch {
    // Vibrar es opcional.
  }
  const ctx = obtenerContexto();
  if (!ctx) return;
  try {
    let t = ctx.currentTime;
    for (const [hercios, ms] of patron.tonos) {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hercios;
      // Entrada y salida de 8 ms: sin el «clic» de cortar una onda a la mitad.
      vol.gain.setValueAtTime(0, t);
      vol.gain.linearRampToValueAtTime(0.18, t + 0.008);
      vol.gain.setValueAtTime(0.18, t + ms / 1000 - 0.008);
      vol.gain.linearRampToValueAtTime(0, t + ms / 1000);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + ms / 1000 + 0.01);
      t += ms / 1000 + 0.06;
    }
  } catch {
    // Sonar es opcional.
  }
}
