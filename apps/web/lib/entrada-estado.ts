/**
 * «¿Hay una entrada o una salida con el colibrí en curso?» — el puente entre el login (`app/login/page.tsx`, que inicia la entrada al iniciar
 * sesión), el botón Salir (`components/LogoutButton.tsx`, que inicia la salida), la capa que las dibuja (`components/login/EntradaColibri.tsx`,
 * montada una vez en el layout raíz para que sobreviva a la navegación) y el loader general (`components/ui/Espera.tsx`, que se aparta mientras
 * dura: el vuelo ocupa su lugar). La geometría y la línea de tiempo viven en `lib/login-entrada.ts`.
 */

import type { Caja } from "./login-entrada";

export type EntradaEnCurso = {
  id: number;
  modo: "entrar" | "salir";
  /** Entrar: dónde está el colibrí del login al empezar. Salir: provisional, hasta que el login carga y se mide el lugar real. */
  origen: Caja;
  /** Solo en la salida: lo que cierra la sesión y lleva a `rutaEsperada`; la capa lo llama cuando la ventana ya se cerró. */
  alLlegarAlCentro?: () => Promise<void>;
  rutaEsperada?: string;
};

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
/** Para el loader y para el botón Salir: mientras vuela el colibrí (entrando o saliendo), el loader general no se muestra y no se inicia otra. */
export function entradaActiva(): boolean {
  return actual !== null;
}

const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mide dónde está el colibrí del login (el grande del panel o, en el celular, el de la marca chica del formulario), en su lugar final.
 * Si el vuelo del login no terminó, el ave está a medio camino: se mide sin su transformación. Null si no hay colibrí a la vista.
 */
export function medirAveDelLogin(): Caja | null {
  const grande = document.querySelector<SVGElement>(".login-ave");
  const el = grande && grande.getBoundingClientRect().width > 0 ? grande : document.querySelector<SVGElement>(".login-marca-chica svg");
  if (!el) return null;
  const transformacion = el.style.transform;
  el.style.transform = "none";
  const r = el.getBoundingClientRect();
  el.style.transform = transformacion;
  return r.width === 0 ? null : { x: r.left, y: r.top, ancho: r.width, alto: r.height };
}

/**
 * Empieza la entrada. Devuelve false —y no hace nada— si la persona pidió menos movimiento o si no hay colibrí a la vista: el login sigue como siempre.
 */
export function iniciarEntrada(): boolean {
  if (typeof window === "undefined" || actual || sinMovimiento()) return false;
  const origen = medirAveDelLogin();
  if (!origen) return false;
  actual = { id: ++contador, modo: "entrar", origen };
  document.documentElement.setAttribute("data-entrando", "");
  avisar();
  return true;
}

/**
 * Empieza la salida. `cerrar` cierra la sesión y navega a `rutaEsperada`; la capa lo llama cuando la ventana ya se cerró y el fondo está oscuro, y
 * espera a que esa ruta cargue para hacer volar al colibrí a su lugar. Devuelve false —y no hace nada— si la persona pidió menos movimiento o ya hay
 * otra en curso: quien llama cierra la sesión como siempre.
 */
export function iniciarSalida(cerrar: () => Promise<void>, rutaEsperada = "/login"): boolean {
  if (typeof window === "undefined" || actual || sinMovimiento()) return false;
  // El lugar real del colibrí se mide cuando el login carga; mientras tanto, uno provisional (el vuelo solo depende de su tamaño al flotar).
  const ancho = Math.min(330, window.innerWidth * 0.2);
  actual = { id: ++contador, modo: "salir", origen: { x: 0, y: 70, ancho, alto: (ancho * 150) / 223 }, alLlegarAlCentro: cerrar, rutaEsperada };
  document.documentElement.setAttribute("data-entrando", "");
  avisar();
  return true;
}

/** La entrada o la salida terminó (ya cubrió la pantalla / ya llegó el colibrí) o se deshizo. */
export function terminarEntrada() {
  if (!actual) return;
  actual = null;
  document.documentElement.removeAttribute("data-entrando");
  avisar();
}
