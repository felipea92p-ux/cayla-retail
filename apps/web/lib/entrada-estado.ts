/**
 * «¿Hay una entrada o una salida con el colibrí en curso?» — el puente entre el login (`app/login/page.tsx`, que inicia la entrada al iniciar
 * sesión), el botón Salir (`components/LogoutButton.tsx`, que inicia la salida), la capa que las dibuja (`components/login/EntradaColibri.tsx`,
 * montada una vez en el layout raíz para que sobreviva a la navegación), la app recién abierta (`EsperaAlVelo`, que no se muestra antes de que el
 * velo tape la pantalla) y el loader general (`components/ui/Espera.tsx`, que se aparta mientras dura: el vuelo ocupa su lugar). La geometría y la
 * línea de tiempo viven en `lib/login-entrada.ts`.
 */

import { MS_TOPE_DEL_VELO, type Caja } from "./login-entrada";
import { saludoDe, type SaludoDeLaEntrada } from "./login-saludo";

export type EntradaEnCurso = {
  id: number;
  modo: "entrar" | "salir";
  /**
   * Lo que dice el saludo bajo el colibrí («Bienvenido(a)» / «Hasta luego» y el nombre). Se MUTA: al entrar, el nombre llega de la base un poco después de empezar
   * (`ponerNombreDelSaludo`) y la capa lo lee en cada cuadro, sin volver a dibujar.
   */
  saludo: SaludoDeLaEntrada;
  /** Entrar: dónde está el colibrí del login al empezar. Salir: provisional, hasta que el login carga y se mide el lugar real. */
  origen: Caja;
  /** Solo en la salida: lo que cierra la sesión y lleva a `rutaEsperada`; la capa lo llama cuando la ventana ya se cerró. */
  alLlegarAlCentro?: () => Promise<void>;
  rutaEsperada?: string;
};

let actual: EntradaEnCurso | null = null;
let contador = 0;
const oyentes = new Set<() => void>();

/**
 * La espera del velo de la entrada en curso: se cumple cuando el velo ya tapa toda la pantalla (Felipe 2026-10-13, «se ve el inicio»). Es UNA promesa
 * por entrada (la misma en cada lectura: React la usa para suspender, `EsperaAlVelo`). Null cuando no hay nada que esperar.
 */
let esperaDelVelo: { id: number; tapa: Promise<void>; soltar: () => void } | null = null;

/** Suelta la espera del velo (de la entrada `id`, o la que haya): ya tapa, la entrada se deshizo o se pasó el tope. */
function soltarElVelo(id?: number) {
  if (!esperaDelVelo || (id !== undefined && esperaDelVelo.id !== id)) return;
  const { soltar } = esperaDelVelo;
  esperaDelVelo = null;
  soltar();
}

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
  const id = ++contador;
  actual = { id, modo: "entrar", saludo: saludoDe("entrar", null, false), origen };
  // La app recién abierta no se muestra hasta que el velo tape la pantalla; si la capa no llega a avisarlo (la pestaña quedó en segundo plano y el
  // navegador frenó el dibujo), la espera se suelta sola al tope: nadie queda esperando para siempre.
  let soltar = () => {};
  const tapa = new Promise<void>((resolver) => (soltar = resolver));
  esperaDelVelo = { id, tapa, soltar };
  window.setTimeout(() => soltarElVelo(id), MS_TOPE_DEL_VELO);
  document.documentElement.setAttribute("data-entrando", "");
  avisar();
  return true;
}

/**
 * Empieza la salida. `cerrar` cierra la sesión y navega a `rutaEsperada`; la capa lo llama cuando la ventana ya se cerró y el fondo está oscuro, y
 * espera a que esa ruta cargue para hacer volar al colibrí a su lugar. Devuelve false —y no hace nada— si la persona pidió menos movimiento o ya hay
 * otra en curso: quien llama cierra la sesión como siempre.
 */
export function iniciarSalida(cerrar: () => Promise<void>, cuenta: { nombre: string; terminal: boolean }, rutaEsperada = "/login"): boolean {
  if (typeof window === "undefined" || actual || sinMovimiento()) return false;
  // El lugar real del colibrí se mide cuando el login carga; mientras tanto, uno provisional (el vuelo solo depende de su tamaño al flotar).
  const ancho = Math.min(330, window.innerWidth * 0.2);
  actual = {
    id: ++contador,
    modo: "salir",
    saludo: saludoDe("salir", cuenta.nombre, cuenta.terminal),
    origen: { x: 0, y: 70, ancho, alto: (ancho * 150) / 223 },
    alLlegarAlCentro: cerrar,
    rutaEsperada,
  };
  document.documentElement.setAttribute("data-entrando", "");
  avisar();
  return true;
}

/** Al entrar, el nombre de la cuenta llega de la base cuando llega: si la entrada sigue en curso, el saludo lo dice; si ya terminó, no hace nada. */
export function ponerNombreDelSaludo(id: number, nombre: string, terminal: boolean) {
  if (actual?.id === id) actual.saludo = saludoDe(actual.modo, nombre, terminal);
}

/**
 * Mientras el velo de la entrada todavía no tapa la pantalla: la promesa que se cumple cuando la tape. Null si no hay nada que esperar (sin entrada,
 * en una salida, o ya tapó). La lee la app recién abierta (`EsperaAlVelo`) para no mostrarse antes: la pantalla de destino se pide al servidor de
 * inmediato y carga debajo del velo, y solo se ve cuando la ventana del colibrí se abre (`veloCubre`, `lib/login-entrada.ts`).
 */
export function veloPendiente(): Promise<void> | null {
  return esperaDelVelo?.tapa ?? null;
}

/** La capa avisa que el velo de ESTA entrada ya tapa la pantalla (una entrada que ya no está no cuenta; avisar dos veces no hace nada). */
export function marcarVeloCubierto(id: number) {
  soltarElVelo(id);
}

/** La entrada o la salida terminó (ya cubrió la pantalla / ya llegó el colibrí) o se deshizo. */
export function terminarEntrada() {
  if (!actual) return;
  actual = null;
  document.documentElement.removeAttribute("data-entrando");
  // La app no se queda esperando a un velo que ya no está.
  soltarElVelo();
  avisar();
}
