"use client";

import { useCallback } from "react";
import { livianoDelDocumento, suscribirLiviano } from "@/lib/liviano-cliente";
import { suscribirTema, temaDelDocumento } from "@/lib/tema-cliente";
import {
  DESENFOQUE_CLARO,
  LUMINOSIDAD,
  claveDelMapa,
  cuerpoDelFiltro,
  mapasDelCanto,
  medidasDelCanto,
  type LadosDelCanto,
  type RellenoDelVidrio,
} from "@/lib/vidrio-dobla";

// El vidrio que dobla (ADR-0681): la parte que toca el navegador. La forma del canto y el filtro se calculan en `lib/vidrio-dobla.ts`.
//
// Una pieza que flota quieta pide doblar con `ref={useVidrioQueDobla({ … })}`. Aquí se mide, se dibuja su mapa, se cuelga un `<filter>`
// SVG con su id y se le deja a la pieza la variable `--dobla` y el atributo `data-dobla-activa`. El CSS (`estilos/vidrio/dobla.css`) solo
// cambia el aspecto de la pieza con ese atributo: sin él, la pieza se ve con su vidrio de siempre.
//
// No dobla (y no hace nada) donde no se puede o no se debe: un navegador que no acepta un filtro SVG en `backdrop-filter` (Safari,
// Firefox), el modo liviano, y quien pidió menos transparencia o más contraste en su aparato.

export type OpcionesDeDoblar = {
  /** Por dónde dobla. Una cápsula o una hoja, `todos` (de fábrica); una barra pegada a un borde, por su lado libre. */
  lados?: LadosDelCanto;
  /** `claro` para una pieza de control; `propio` (de fábrica) para una que se lee: conserva su relleno y solo dobla en el canto. */
  relleno?: RellenoDelVidrio;
  /** El desenfoque que la pieza ya tenía, en px, para que su centro quede igual. Solo cuenta con relleno `propio`. */
  desenfoque?: number;
  bisel?: number;
  grosor?: number;
};

const SVG = "http://www.w3.org/2000/svg";
const ATRIBUTO = "data-dobla-activa";
const PIDE_MACIZO = "(prefers-reduced-transparency: reduce), (prefers-contrast: more)";
/** Un mapa por tamaño de pieza. Al cambiar el ancho de la ventana nacen muchos: se guardan los últimos. */
const MAPAS_GUARDADOS = 24;

type Pieza = { opciones: OpcionesDeDoblar; id: string; espera: number; talla: string };

const piezas = new Map<HTMLElement, Pieza>();
const mapas = new Map<string, { mapa: string; mascara: string; max: number }>();
let caja: SVGSVGElement | null = null;
let alMedir: ResizeObserver | null = null;
let soltarAvisos: (() => void) | null = null;
let siguiente = 0;

function puedeDoblar(): boolean {
  if (typeof CSS === "undefined" || !CSS.supports("backdrop-filter", "url(#x)")) return false;
  return livianoDelDocumento() !== "si" && !window.matchMedia(PIDE_MACIZO).matches;
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
  if (!puedeDoblar() || ancho < 8 || alto < 8) {
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
  const pieza: Pieza = { opciones, id: `dobla-${++siguiente}`, espera: 0, talla: "" };
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
  const { lados, relleno, desenfoque, bisel, grosor } = opciones;
  return useCallback(
    (el: T | null) => {
      if (!el) return;
      return registrar(el, { lados, relleno, desenfoque, bisel, grosor });
    },
    [lados, relleno, desenfoque, bisel, grosor],
  );
}
