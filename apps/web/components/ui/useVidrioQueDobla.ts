"use client";

import { useCallback, useEffect, type RefObject } from "react";
import { livianoDelDocumento, suscribirLiviano } from "@/lib/liviano-cliente";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { suscribirTema, temaDelDocumento } from "@/lib/tema-cliente";
import {
  DESENFOQUE_CLARO,
  LUMINOSIDAD,
  claveDelMapa,
  cuerpoDelFiltro,
  mapasDelCanto,
  medidasDelCanto,
  navegadorDibujaDobla,
  type LadosDelCanto,
  type NavegadorQueSeDescribe,
  type RellenoDelVidrio,
} from "@/lib/vidrio-dobla";

// El vidrio que dobla (ADR-0681): la parte que toca el navegador. La forma del canto y el filtro se calculan en `lib/vidrio-dobla.ts`.
//
// Una pieza que flota quieta pide doblar con `ref={useVidrioQueDobla({ … })}`. Aquí se mide, se dibuja su mapa, se cuelga un `<filter>`
// SVG con su id y se le deja a la pieza la variable `--dobla` y el atributo `data-dobla-activa`. El CSS (`estilos/vidrio/dobla.css`) solo
// cambia el aspecto de la pieza con ese atributo: sin él, la pieza se ve con su vidrio de siempre.
//
// No dobla (y no hace nada) donde no se puede o no se debe: un navegador que no DIBUJA un filtro SVG en `backdrop-filter` (Safari,
// Firefox: Safari dice aceptarlo y no lo dibuja, por eso se pregunta por el motor), el modo liviano, y quien pidió menos transparencia o más contraste en su aparato.

export type OpcionesDeDoblar = {
  /** Por dónde dobla. Una cápsula o una hoja, `todos` (de fábrica); una barra pegada a un borde, por su lado libre. */
  lados?: LadosDelCanto;
  /** `claro` para una pieza de control; `propio` (de fábrica) para una que se lee: conserva su relleno y solo dobla en el canto. */
  relleno?: RellenoDelVidrio;
  /** El desenfoque que la pieza ya tenía, en px, para que su centro quede igual. Solo cuenta con relleno `propio`. */
  desenfoque?: number;
  bisel?: number;
  grosor?: number;
  /** Una consulta de medios: la pieza solo dobla mientras se cumple. La isla solo flota en el celular; en escritorio es una barra a ras. */
  solo?: string;
  /** Al aparecer, el vidrio «se asienta»: dobla de más y vuelve a su medida. Para lo que entra y sale (un aviso, una hoja). Una vez, sin rebote. */
  asienta?: boolean;
  /** `false` deja la pieza como está (la isla oscura no es de vidrio). De fábrica, `true`. */
  activo?: boolean;
};

const SVG = "http://www.w3.org/2000/svg";
const ATRIBUTO = "data-dobla-activa";
const PIDE_MACIZO = "(prefers-reduced-transparency: reduce), (prefers-contrast: more)";
/** Un mapa por tamaño de pieza. Al cambiar el ancho de la ventana nacen muchos: se guardan los últimos. */
const MAPAS_GUARDADOS = 24;

type Pieza = { opciones: OpcionesDeDoblar; id: string; espera: number; talla: string; asentada: boolean };

const piezas = new Map<HTMLElement, Pieza>();
const mapas = new Map<string, { mapa: string; mascara: string; max: number }>();
let caja: SVGSVGElement | null = null;
let alMedir: ResizeObserver | null = null;
let soltarAvisos: (() => void) | null = null;
let siguiente = 0;

function puedeDoblar(solo?: string): boolean {
  // Por el motor y no por `CSS.supports`: Safari acepta la frase y no la dibuja (navegadorDibujaDobla, lib/vidrio-dobla.ts).
  if (typeof navigator === "undefined" || !navegadorDibujaDobla(navigator as NavegadorQueSeDescribe)) return false;
  if (solo && !window.matchMedia(solo).matches) return false;
  return livianoDelDocumento() !== "si" && !window.matchMedia(PIDE_MACIZO).matches;
}

/** Cuánto dura que el vidrio se asiente al aparecer, en ms (ADR-0136: una respuesta corta, de 200 a 500 ms). */
const ASIENTA_MS = 480;
/** Con cuánta fuerza de más dobla al aparecer. */
const ASIENTA_DESDE = 2.2;

/** El vidrio recién llegado dobla de más y vuelve a su medida, frenando (sin rebote). Solo cambia la fuerza del filtro: el mapa no se rehace. */
function asentar(filtro: SVGFilterElement): void {
  if (prefiereQuieto()) return;
  const nodos = [...filtro.querySelectorAll("feDisplacementMap")];
  const finales = nodos.map((n) => Number(n.getAttribute("scale")));
  const inicio = performance.now();
  const paso = (ahora: number) => {
    const avance = Math.min(1, (ahora - inicio) / ASIENTA_MS);
    const fuerza = ASIENTA_DESDE + (1 - ASIENTA_DESDE) * (1 - (1 - avance) ** 3);
    nodos.forEach((n, i) => n.setAttribute("scale", String(Math.round(finales[i] * fuerza * 100) / 100)));
    if (avance < 1 && filtro.isConnected) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Los filtros viven en un `<svg>` sin tamaño al final del `<body>`. No puede ir con `display: none`: el filtro dejaría de aplicarse. */
function laCaja(): SVGSVGElement {
  if (caja?.isConnected) return caja;
  caja = document.createElementNS(SVG, "svg");
  caja.setAttribute("aria-hidden", "true");
  caja.setAttribute("width", "0");
  caja.setAttribute("height", "0");
  caja.style.position = "absolute";
  document.body.appendChild(caja);
  return caja;
}

function comoImagen(pixeles: Uint8ClampedArray, ancho: number, alto: number): string {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const dibujo = lienzo.getContext("2d");
  if (!dibujo) return "";
  const imagen = dibujo.createImageData(ancho, alto);
  imagen.data.set(pixeles);
  dibujo.putImageData(imagen, 0, 0);
  return lienzo.toDataURL("image/png");
}

function desvestir(el: HTMLElement, pieza: Pieza): void {
  document.getElementById(pieza.id)?.remove();
  el.style.removeProperty("--dobla");
  el.removeAttribute(ATRIBUTO);
  pieza.talla = "";
}

function vestir(el: HTMLElement, pieza: Pieza): void {
  const ancho = Math.round(el.offsetWidth);
  const alto = Math.round(el.offsetHeight);
  if (!puedeDoblar(pieza.opciones.solo) || ancho < 8 || alto < 8) {
    desvestir(el, pieza);
    return;
  }
  const { lados = "todos", relleno = "propio" } = pieza.opciones;
  const tema = temaDelDocumento();
  const talla = [ancho, alto, tema].join("|");
  if (talla === pieza.talla) return;

  const radio = lados === "todos" ? parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 : 0;
  const medidas = medidasDelCanto({ ancho, alto, radio, lados, relleno, bisel: pieza.opciones.bisel, grosor: pieza.opciones.grosor });
  const clave = claveDelMapa(medidas);
  let hecho = mapas.get(clave);
  if (!hecho) {
    const { mapa, mascara, max } = mapasDelCanto(medidas);
    hecho = { mapa: comoImagen(mapa, ancho, alto), mascara: comoImagen(mascara, ancho, alto), max };
    mapas.set(clave, hecho);
    if (mapas.size > MAPAS_GUARDADOS) mapas.delete(mapas.keys().next().value as string);
  }

  const claro = relleno === "claro";
  const filtro = document.createElementNS(SVG, "filter");
  filtro.setAttribute("id", pieza.id);
  filtro.setAttribute("filterUnits", "userSpaceOnUse");
  filtro.setAttribute("x", "0");
  filtro.setAttribute("y", "0");
  filtro.setAttribute("width", String(ancho));
  filtro.setAttribute("height", String(alto));
  filtro.setAttribute("color-interpolation-filters", "sRGB");
  filtro.innerHTML = cuerpoDelFiltro({
    ancho,
    alto,
    ...hecho,
    desenfoque: claro ? (lados === "todos" ? DESENFOQUE_CLARO.capsula : DESENFOQUE_CLARO.barra) : (pieza.opciones.desenfoque ?? 24),
    luminosidad: claro ? LUMINOSIDAD[tema] : null,
  });
  document.getElementById(pieza.id)?.remove();
  laCaja().appendChild(filtro);
  el.style.setProperty("--dobla", `url(#${pieza.id})`);
  el.setAttribute(ATRIBUTO, relleno);
  pieza.talla = talla;
  if (pieza.opciones.asienta && !pieza.asentada) asentar(filtro);
  pieza.asentada = true;
}

function vestirTodas(): void {
  for (const [el, pieza] of piezas) {
    pieza.talla = "";
    vestir(el, pieza);
  }
}

/** El tema cambia la luminosidad del filtro; el modo liviano y las preferencias del aparato deciden si se dobla o no. */
function escucharAvisos(): () => void {
  const soltarTema = suscribirTema(vestirTodas);
  const soltarLiviano = suscribirLiviano(vestirTodas);
  const macizo = window.matchMedia(PIDE_MACIZO);
  macizo.addEventListener("change", vestirTodas);
  return () => {
    soltarTema();
    soltarLiviano();
    macizo.removeEventListener("change", vestirTodas);
  };
}

function registrar(el: HTMLElement, opciones: OpcionesDeDoblar): () => void {
  const pieza: Pieza = { opciones, id: `dobla-${++siguiente}`, espera: 0, talla: "", asentada: false };
  // Una pieza que solo dobla en cierto ancho (la isla) se viste o se desviste al cruzarlo.
  const cruce = opciones.solo ? window.matchMedia(opciones.solo) : null;
  const alCruzar = () => vestir(el, pieza);
  cruce?.addEventListener("change", alCruzar);
  piezas.set(el, pieza);
  soltarAvisos ??= escucharAvisos();
  // Si la pieza cambia de tamaño, su mapa ya no le calza: se rehace, con una pausa para no rehacerlo en cada px de un arrastre.
  alMedir ??= new ResizeObserver((entradas) => {
    for (const { target } of entradas) {
      const cual = piezas.get(target as HTMLElement);
      if (!cual) continue;
      window.clearTimeout(cual.espera);
      cual.espera = window.setTimeout(() => vestir(target as HTMLElement, cual), 120);
    }
  });
  alMedir.observe(el);
  vestir(el, pieza);

  return () => {
    window.clearTimeout(pieza.espera);
    cruce?.removeEventListener("change", alCruzar);
    alMedir?.unobserve(el);
    desvestir(el, pieza);
    piezas.delete(el);
    if (piezas.size > 0) return;
    soltarAvisos?.();
    soltarAvisos = null;
    caja?.remove();
    caja = null;
  };
}

/**
 * Hace que una pieza que flota doble lo que tiene detrás. Se usa como `ref`:
 *
 *   const dobla = useVidrioQueDobla<HTMLDivElement>({ lados: "abajo", relleno: "claro" });
 *   <div ref={dobla} className="…" />
 *
 * La pieza tiene que tener su regla en `estilos/vidrio/dobla.css` (qué cambia con `data-dobla-activa`).
 */
export function useVidrioQueDobla<T extends HTMLElement>(opciones: OpcionesDeDoblar = {}): (el: T | null) => void | (() => void) {
  const { lados, relleno, desenfoque, bisel, grosor, solo, asienta, activo = true } = opciones;
  return useCallback(
    (el: T | null) => {
      if (!el || !activo) return;
      return registrar(el, { lados, relleno, desenfoque, bisel, grosor, solo, asienta });
    },
    [lados, relleno, desenfoque, bisel, grosor, solo, asienta, activo],
  );
}

/** Lo mismo, para una pieza que ya tiene su propio `ref` (un aviso, una hoja): `useVidrioQueDoblaEn(miRef, { … })`. */
export function useVidrioQueDoblaEn(ref: RefObject<HTMLElement | null>, opciones: OpcionesDeDoblar = {}): void {
  const { lados, relleno, desenfoque, bisel, grosor, solo, asienta, activo = true } = opciones;
  useEffect(() => {
    const el = ref.current;
    if (!el || !activo) return;
    return registrar(el, { lados, relleno, desenfoque, bisel, grosor, solo, asienta });
  }, [ref, lados, relleno, desenfoque, bisel, grosor, solo, asienta, activo]);
}
