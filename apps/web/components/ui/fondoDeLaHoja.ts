"use client";

import { fondoSegun } from "@/lib/hoja-gesto";

/* ====================================================================
   Lo de atrás se aleja (ADR-0479, la «B» que eligió Felipe el 2026-10-22)

   Con una hoja abierta en el celular, la pantalla de atrás se aleja a 0,92, baja 12 px y su cabecera se redondea: se lee
   como una tarjeta que sigue ahí, debajo. Mientras el dedo baja la hoja, vuelve a su lugar al mismo ritmo.

   Lo que se aleja lleva `data-fondo-hoja` (la cabecera con `="borde"`, el contenido y la persiana de Caja cerrada). Se
   escalan por separado, pero todas alrededor del MISMO punto de la pantalla (el centro de arriba de lo que se ve), así que
   se ven como una sola tarjeta aunque la página esté bajada y la cabecera sea `fixed`.

   Lo `fixed` que vive DENTRO de algo que se escala (el aviso de cierre de caja, «sin conexión», las barras de abajo) se
   ubicaría mal: un `transform` lo vuelve relativo a su contenedor. Mientras la hoja está abierta se esconde (queda detrás
   de ella) y al volver aparece con un fundido corto.

   Una sola hoja a la vez es la dueña del efecto: la que se abre encima de otra no aleja nada más.
   ==================================================================== */

const CAPAS = "[data-fondo-hoja]";

let duena: symbol | null = null;
let capas: HTMLElement[] = [];
let escondidos: HTMLElement[] = [];
let reloj: ReturnType<typeof setTimeout> | undefined;

function pintar(progreso: number, ms: number) {
  const { escala, bajada, radio } = fondoSegun(progreso);
  const t = ms ? `${ms}ms var(--ease-cayla)` : "0ms";
  for (const el of capas) {
    el.style.transition = `transform ${t}, border-radius ${t}`;
    el.style.transform = `translate3d(0, ${bajada}px, 0) scale(${escala})`;
    if (el.dataset.fondoHoja === "borde") {
      el.style.borderTopLeftRadius = `${radio}px`;
      el.style.borderTopRightRadius = `${radio}px`;
    }
  }
}

/** Lo `fixed` dentro de una capa (sin mirar el estilo de cada nodo: un elemento fijo no tiene `offsetParent`). */
function fijosDentro(raices: HTMLElement[]): HTMLElement[] {
  const fijos: HTMLElement[] = [];
  for (const raiz of raices) {
    for (const el of raiz.querySelectorAll("*")) {
      if (el instanceof HTMLElement && el.offsetParent === null && el.getClientRects().length > 0 && getComputedStyle(el).position === "fixed") fijos.push(el);
    }
  }
  return fijos;
}

function soltarTodo() {
  clearTimeout(reloj);
  for (const el of capas) {
    for (const p of ["transition", "transform", "transform-origin", "will-change", "clip-path", "border-top-left-radius", "border-top-right-radius"]) el.style.removeProperty(p);
  }
  for (const el of escondidos) {
    el.style.removeProperty("visibility");
    el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" });
  }
  capas = [];
  escondidos = [];
}

/**
 * Aleja lo de atrás en `ms` y devuelve la llave de la hoja que lo hizo, o `null` si ya hay otra hoja dueña o no hay nada
 * que alejar (una pantalla fuera del marco del ERP).
 */
export function alejarFondo(ms: number): symbol | null {
  if (duena) return null;
  soltarTodo();
  capas = [...document.querySelectorAll<HTMLElement>(CAPAS)];
  if (capas.length === 0) return null;
  // ANTES de tocar los estilos: un `will-change: transform` ya vuelve a la capa contenedora de lo fijo de adentro, y eso
  // dejaría de verse como fijo.
  escondidos = fijosDentro(capas);
  const centro = window.innerWidth / 2;
  for (const el of capas) {
    const r = el.getBoundingClientRect();
    el.style.transformOrigin = `${centro - r.left}px ${-r.top}px`;
    el.style.willChange = "transform";
    // Lo que quedaba justo arriba de la pantalla (con la página bajada) asomaría sobre la cabecera al achicarse: se recorta
    // en el borde de arriba de lo que se ve, y la tarjeta empieza en la cabecera.
    if (el.dataset.fondoHoja !== "borde" && r.top < 0) el.style.clipPath = `inset(${Math.round(-r.top)}px 0 0 0)`;
  }
  for (const el of escondidos) el.style.visibility = "hidden";
  duena = Symbol("hoja");
  pintar(1, 0);
  void document.body.offsetWidth;
  pintar(0, ms);
  return duena;
}

/** Mientras el dedo lleva la hoja: lo de atrás sigue su progreso (0 abierta, 1 cerrada). */
export function moverFondo(llave: symbol | null, progreso: number, ms: number) {
  if (!llave || llave !== duena) return;
  pintar(progreso, ms);
}

/** La hoja se va: lo de atrás vuelve a su lugar en `ms` y después queda sin ningún estilo puesto. */
export function devolverFondo(llave: symbol | null, ms: number) {
  if (!llave || llave !== duena) return;
  duena = null;
  pintar(1, ms);
  clearTimeout(reloj);
  reloj = setTimeout(soltarTodo, ms + 20);
}
