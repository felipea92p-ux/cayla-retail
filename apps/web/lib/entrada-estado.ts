/**
 * «¿Hay una entrada con el colibrí en curso?» — el puente entre el login (`app/login/page.tsx`, que la inicia al iniciar sesión),
 * la capa que la dibuja (`components/login/EntradaColibri.tsx`, montada una vez en el layout raíz para que sobreviva a la
 * navegación) y el loader general (`components/ui/Espera.tsx`, que se aparta mientras dura: el vuelo ocupa su lugar).
 * La geometría y la línea de tiempo viven en `lib/login-entrada.ts`.
 */

import type { Caja } from "./login-entrada";

export type EntradaEnCurso = { id: number; origen: Caja };

let actual: EntradaEnCurso | null = null;
let contador = 0;
const oyentes = new Set<() => void>();

function avisar() {
  oyentes.forEach((o) => o());
}

export function suscribirEntrada(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => void oyentes.delete(oyente);
}
export function entradaEnCurso(): EntradaEnCurso | null {
  return actual;
}
/** Para el loader: mientras vuela el colibrí, el loader general no se muestra. */
export function entradaActiva(): boolean {
  return actual !== null;
}

/**
 * Mide dónde está el colibrí del login (el grande del panel o, en el celular, el de la marca chica del formulario) y empieza la entrada.
 * Devuelve false —y no hace nada— si la persona pidió menos movimiento o si no hay colibrí a la vista: el login sigue como siempre.
 */
export function iniciarEntrada(): boolean {
  if (typeof window === "undefined" || actual) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const grande = document.querySelector<SVGElement>(".login-ave");
  const el = grande && grande.getBoundingClientRect().width > 0 ? grande : document.querySelector<SVGElement>(".login-marca-chica svg");
  if (!el) return false;
  // Si el vuelo del login no terminó, el ave está a medio camino: se mide en su lugar final, sin su transformación.
  const transformacion = el.style.transform;
  el.style.transform = "none";
  const r = el.getBoundingClientRect();
  el.style.transform = transformacion;
  if (r.width === 0) return false;
  actual = { id: ++contador, origen: { x: r.left, y: r.top, ancho: r.width, alto: r.height } };
  document.documentElement.setAttribute("data-entrando", "");
  avisar();
  return true;
}

/** La entrada terminó (la ventana ya cubre la pantalla) o se deshizo. */
export function terminarEntrada() {
  if (!actual) return;
  actual = null;
  document.documentElement.removeAttribute("data-entrando");
  avisar();
}
