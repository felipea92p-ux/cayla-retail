"use client";

import { useSyncExternalStore } from "react";
import { hayRedReal, pruebaRed, VENTANA_RED_MS } from "@/lib/sin-conexion-reglas";

/**
 * ¿Hay red? Una sola respuesta para todo el ERP (aviso de la cabecera, Cerrar caja, Nuevo producto, el club).
 *
 * Hasta el 2026-10-10 era `navigator.onLine` a secas, y en la caja de Trujillo el navegador dijo «sin red» toda una
 * mañana con internet funcionando (15 ventas subieron bien). Ahora cada respuesta que llega de la base queda anotada y,
 * si hay una de hace menos de 90 s, hay red aunque el navegador diga que no (`hayRedReal`, con su prueba). Los sondeos
 * (turno, caja, precios, stock) ya no se apagan por `navigator.onLine`: siguen intentando y sus respuestas son la
 * evidencia.
 *
 * Sigue siendo solo para AVISAR: guardar nunca depende de esto — se intenta y, si falla, se encola (ADR-0210).
 */

let ultimaRespuestaMs: number | null = null;
let instantanea = true;
let reloj: number | undefined;
const oyentes = new Set<() => void>();

function recalcular() {
  const nueva = hayRedReal({ navegadorDice: navigator.onLine, ultimaRespuestaMs, ahoraMs: Date.now() });
  if (nueva !== instantanea) {
    instantanea = nueva;
    for (const o of oyentes) o();
  }
  // Cuando la evidencia envejezca hay que volver a mirar (solo importa si el navegador dice «sin red»).
  window.clearTimeout(reloj);
  if (!navigator.onLine && ultimaRespuestaMs !== null) reloj = window.setTimeout(recalcular, VENTANA_RED_MS + 500);
}

/** Llegó una respuesta de la base (cualquier estado HTTP: si respondió, hay red). */
export function anotarRespuestaDeLaBase() {
  ultimaRespuestaMs = Date.now();
  recalcular();
}

declare global {
  interface Window {
    __redRealInstalada?: boolean;
  }
}

/** Mira, sin tocarlas, las respuestas de `fetch` que vienen de la base. Se instala una vez, al cargar este archivo. */
function instalarObservador() {
  if (typeof window === "undefined" || window.__redRealInstalada) return;
  window.__redRealInstalada = true;
  instantanea = navigator.onLine;
  const hostSupabase = (() => {
    try {
      return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
    } catch {
      return null;
    }
  })();
  const anterior = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const promesa = anterior(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (pruebaRed(new URL(url, window.location.href).href, hostSupabase)) {
        promesa.then(anotarRespuestaDeLaBase, () => {});
      }
    } catch {
      /* una URL rara no detiene la petición */
    }
    return promesa;
  };
  window.addEventListener("online", recalcular);
  window.addEventListener("offline", recalcular);
}
instalarObservador();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

/** ¿Hay red? `true` si el navegador lo dice o si la base respondió hace menos de 90 s. En el servidor, sí. */
export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribir, () => instantanea, () => true);
}

/** Lo mismo, leído una vez (fuera de React o en un manejador). */
export function hayRedAhora(): boolean {
  return typeof window === "undefined" ? true : instantanea;
}
