/**
 * El bip del conteo (parte 1 de Conteo conectado, 2026-09-26): con la pistola o la cámara se mira el rack, no la
 * pantalla, así que cada lectura dice con el oído y con la vibración qué pasó (`PATRON_SONIDO` en `conteo-conectado.ts`).
 * Desde el 2026-10-23 suena en TODA lectura con la cámara del teléfono, no solo al contar: Vender, Apartados, Existencias,
 * Cambios, Movimientos, Prendas de una etiqueta y Recibir traslado (`sonidoDeLecturaCamara`, `lib/escaner-sonido.test.ts`).
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
    // Un contexto nace «suspendido», y el iPhone lo vuelve a dormir al pasar a segundo plano: se despierta en cada uso.
    if (contexto.state !== "running") void contexto.resume().catch(() => undefined);
    return contexto;
  } catch {
    return null;
  }
}

// La cámara lee sola, sin que nadie toque la pantalla, y el iPhone solo deja arrancar el sonido DENTRO de un toque: un contexto
// que naciera en la primera lectura podría nacer mudo (Chrome en Android es más permisivo: le basta un toque cualquiera antes). Por
// eso se crea y se despierta en el primer toque o tecla de la pantalla —el que abre la cámara— y se deja de escuchar en cuanto
// suena (o si el navegador no tiene audio).
if (typeof document !== "undefined") {
  const EVENTOS = ["touchend", "click", "keydown"] as const;
  const despertar = () => {
    const ctx = obtenerContexto();
    if (ctx && ctx.state !== "running") return;
    for (const e of EVENTOS) document.removeEventListener(e, despertar, true);
  };
  for (const e of EVENTOS) document.addEventListener(e, despertar, true);
}

export type PatronSonoro = { tonos: readonly (readonly [number, number])[]; vibracion: number | number[] };

/** Suena y vibra con un patrón (tonos en hercios y milisegundos, y vibración). Nunca lanza. Lo usan el bip del conteo y el sonido
 *  de «confirmado» (`sonido-confirmar.ts`): un solo motor de audio en toda la web, no uno por pantalla. */
export function reproducirPatron(patron: PatronSonoro): void {
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

/** Suena y vibra según lo que pasó con la lectura. Nunca lanza. */
export function avisarLectura(sonido: SonidoLectura): void {
  reproducirPatron(PATRON_SONIDO[sonido]);
}
