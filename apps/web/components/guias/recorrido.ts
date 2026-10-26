"use client";

import { leerRecorrido, type Tramo } from "@/lib/asistente/recorrido";

// El recorrido de «Pregúntale a CAYLA» (ADR-0529, actividad 3) mientras pasa de una pantalla a otra: los tramos que faltan viven en el
// navegador de la pestaña (`sessionStorage`), porque navegar desmonta el cajón que los pidió. Es una comodidad: si el navegador no deja
// guardar (ventana privada), el recorrido llega hasta el primer tramo y nada se rompe.

const CLAVE = "cayla-recorrido";

/** Guarda los tramos que vienen después del que arranca ahora (ninguno: borra lo que hubiera). */
export function guardarRestantes(tramos: readonly Tramo[]) {
  try {
    if (tramos.length === 0) sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, JSON.stringify({ tramos, creado: Date.now() }));
  } catch {
    // Sin almacenamiento: el recorrido termina en este tramo.
  }
}

/** El siguiente tramo, que deja de estar pendiente al tomarlo. */
export function tomarSiguiente(): Tramo | null {
  try {
    const guardado = leerRecorrido(sessionStorage.getItem(CLAVE), Date.now());
    if (!guardado) {
      sessionStorage.removeItem(CLAVE);
      return null;
    }
    const [siguiente, ...resto] = guardado.tramos;
    guardarRestantes(resto);
    return siguiente ?? null;
  } catch {
    return null;
  }
}

/** La persona salió a mitad de camino (o eligió otra demo): lo que faltaba ya no se recorre. */
export function olvidarRecorrido() {
  guardarRestantes([]);
}

/** Una marca de esta vez, para que el motor no tome por repetido un tramo que la persona pidió de nuevo. */
export const marcaDeVez = () => Date.now().toString(36);
