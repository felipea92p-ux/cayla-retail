"use client";

import { useEffect } from "react";
import { avisar } from "@/components/ui/Avisos";
import { sistemaDelEquipo } from "@/lib/guia-impresion-reglas";
import { ayudanteImprimeBoletas, documentoDeBoleta, largoDeLaBoleta, resultadoDeBoleta, URL_AYUDANTE } from "@/lib/mac-etiquetas";
import { sePuedeImprimirAqui } from "@/components/impresion/imprimirEnEstaVentana";
import { ventanaDelEquipo } from "@/lib/ventana-de-impresion";

/**
 * Imprimir la boleta montada en `#comprobante-print` (ADR-0670, act. 2026-11-16). Todo ticket térmico del ERP pasa por aquí: el
 * recibo de venta, el ticket de un cambio, el de un apartado y la estación de la caja.
 *
 * · En una Mac cuyo ayudante tiene la ticketera (versión 3): la boleta se mide, se manda al ayudante y sale sin cuadro desde el
 *   Chrome de siempre. Así la Mac del piso no necesita un ícono aparte con `--kiosk-printing`.
 * · Si no (Windows, una Mac sin ayudante o con uno viejo): `window.print()` con el freno de la ventana, como antes.
 *
 * Termina cuando la boleta ya se mandó: quien cierra la hoja después (Venta registrada) no la desmonta antes de tiempo.
 */
export type FinBoleta = "impresa" | "cuadro" | "frenada" | "fallo";

const ID = "comprobante-print";
/** Cuánto se espera al ayudante al preguntarle si está. En una Mac sin él la respuesta llega al instante (conexión rechazada); lo que
 *  tarda es el aviso de Chrome «acceso a la red local» la primera vez, mientras la persona elige Permitir. */
const ESPERA_ESTADO_MS = 5000;
/** Cada cuánto se vuelve a preguntar. Instalar el ayudante o conectar la ticketera se nota sin recargar. */
const VIGENCIA_MS = 30_000;

let conocido: boolean | null = null;
let cuando = 0;
let enCurso: Promise<boolean> | null = null;
const oyentes = new Set<() => void>();

const esMac = () => typeof navigator !== "undefined" && sistemaDelEquipo(navigator.userAgent, navigator.platform) === "mac";

/** ¿Esta Mac imprime la boleta por el ayudante? Pregunta a lo más cada 30 s; en otro sistema, no pregunta. */
export function comprobarBoletasPorAyudante(): Promise<boolean> {
  if (!esMac()) return Promise.resolve(false);
  if (conocido !== null && Date.now() - cuando < VIGENCIA_MS) return Promise.resolve(conocido);
  enCurso ??= fetch(`${URL_AYUDANTE}/estado`, { cache: "no-store", signal: AbortSignal.timeout(ESPERA_ESTADO_MS) })
    .then((r) => r.json())
    .then(ayudanteImprimeBoletas)
    .catch(() => false)
    .then((si) => {
      const cambio = si !== conocido;
      conocido = si;
      cuando = Date.now();
      enCurso = null;
      if (cambio) oyentes.forEach((f) => f());
      return si;
    });
  return enCurso;
}

/** Para `useSyncExternalStore`: esta Mac es «la caja» porque su ayudante tiene la ticketera (la estación y «Venta registrada»). */
export const boletasPorAyudante = {
  suscribir(alCambiar: () => void) {
    oyentes.add(alCambiar);
    void comprobarBoletasPorAyudante();
    return () => void oyentes.delete(alCambiar);
  },
  leer: () => conocido === true,
  leerEnServidor: () => false,
};

let ultimoDespertar = 0;

/**
 * Despierta al Chrome del ayudante (`GET /calentar`) unos segundos antes de imprimir. Después de un rato sin usarse, el primer PDF tarda
 * ~1,1 s; con Chrome corrido 3 a 8 s antes, 0,5 s (medido el 2026-11-16). Solo en una Mac cuyo ayudante imprime boletas, a lo más
 * cada 10 s, sin esperar respuesta: si no contesta, la boleta sale igual, un poco más lenta.
 */
export function despertarAyudante(): void {
  if (!esMac()) return;
  void comprobarBoletasPorAyudante().then((si) => {
    if (!si || Date.now() - ultimoDespertar < 10_000) return;
    ultimoDespertar = Date.now();
    void fetch(`${URL_AYUDANTE}/calentar`, { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  });
}

/** Despierta al ayudante al abrir una hoja desde la que se imprime un ticket (el cobro, Venta registrada, el detalle, un cambio). */
export function useDespertarAyudante(activo = true): void {
  useEffect(() => {
    if (activo) despertarAyudante();
  }, [activo]);
}

/**
 * Las reglas de impresión de la boleta (`@media print` de `globals.css`) con otro id, para dibujar una copia en pantalla y medir
 * cuánto papel ocupa. Las que nombran `html` o `body` quedan fuera: esconden la página entera.
 */
function reglasParaMedir(idCopia: string): string {
  const reglas: string[] = [];
  const recorrer = (lista: CSSRuleList, enImpresion: boolean) => {
    for (const regla of Array.from(lista)) {
      if (regla instanceof CSSMediaRule) recorrer(regla.cssRules, enImpresion || /\bprint\b/.test(regla.media.mediaText));
      else if (regla instanceof CSSStyleRule) {
        if (enImpresion && regla.selectorText.includes(`#${ID}`) && !/(^|[\s,(>~+])(html|body)\b/.test(regla.selectorText)) {
          reglas.push(regla.cssText.replaceAll(`#${ID}`, `#${idCopia}`));
        }
      } else if ("cssRules" in regla && (regla as CSSGroupingRule).cssRules) recorrer((regla as CSSGroupingRule).cssRules, enImpresion);
    }
  };
  for (const hoja of Array.from(document.styleSheets)) {
    try {
      recorrer(hoja.cssRules, false);
    } catch {
      // Una hoja de otro origen no deja leer sus reglas: las de la boleta son nuestras.
    }
  }
  return reglas.join("\n");
}

/** El alto de la boleta en papel, en píxeles CSS: una copia invisible con las reglas de impresión, medida y quitada. */
function medirBoleta(nodo: HTMLElement): number {
  const idCopia = "comprobante-medida";
  const estilo = document.createElement("style");
  estilo.textContent = `#${idCopia}{display:block!important}\n${reglasParaMedir(idCopia)}`;
  const caja = document.createElement("div");
  caja.setAttribute("aria-hidden", "true");
  caja.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;contain:layout";
  const copia = nodo.cloneNode(true) as HTMLElement;
  copia.id = idCopia;
  caja.appendChild(copia);
  document.head.appendChild(estilo);
  document.body.appendChild(caja);
  try {
    return copia.getBoundingClientRect().height;
  } finally {
    caja.remove();
    estilo.remove();
  }
}

/**
 * Solo las reglas que tocan la boleta, escritas dentro del documento. Antes iban los `<link>` de las hojas de estilo del ERP y el
 * Chrome del ayudante (un perfil nuevo en cada boleta, sin caché) las bajaba de internet cada vez: 1,3 a 1,9 s por boleta, contra
 * 0,5 s con los estilos adentro (medido el 2026-11-16). Entra toda regla que nombra `#comprobante-print` o una clase que la boleta
 * usa (`rt-*`, `sr-only`, las del logo); quedan fuera las de otros anchos y del modo oscuro, y las variables de `:root` (39 KB que la
 * boleta no usa: sus reglas son negro sobre blanco, sin tokens, y con ellas el PDF tardaba 0,6 s en vez de 0,5). Las capas
 * (`@layer`) se aplanan en su orden: la boleta no depende de su prioridad.
 */
function estilosDeLaBoleta(nodo: HTMLElement): string {
  const clases = new Set<string>();
  for (const el of [nodo, ...nodo.querySelectorAll("[class]")]) el.classList.forEach((c) => clases.add(c));
  const laNombra = (selector: string) =>
    selector.includes(`#${ID}`) ||
    Array.from(selector.matchAll(/\.((?:\\.|[\w-])+)/g)).some((m) => clases.has(m[1].replace(/\\(.)/g, "$1")));
  const salida: string[] = [];
  const recorrer = (lista: CSSRuleList, envolver: (texto: string) => string) => {
    for (const regla of Array.from(lista)) {
      if (regla instanceof CSSMediaRule) {
        const medio = regla.media.mediaText.trim();
        if (medio === "" || medio === "all" || /\bprint\b/.test(medio)) recorrer(regla.cssRules, (t) => envolver(`@media ${medio || "all"}{${t}}`));
      } else if (regla instanceof CSSStyleRule) {
        if (laNombra(regla.selectorText)) salida.push(envolver(regla.cssText));
      } else if (!(regla instanceof CSSPageRule) && "cssRules" in regla) {
        recorrer((regla as CSSGroupingRule).cssRules, envolver);
      }
    }
  };
  for (const hoja of Array.from(document.styleSheets)) {
    try {
      recorrer(hoja.cssRules, (t) => t);
    } catch {
      // Una hoja de otro origen no deja leer sus reglas: las de la boleta son nuestras.
    }
  }
  return `<style>${salida.join("\n").replace(/<\/style/gi, "<\\/style")}</style>`;
}

/** Manda la boleta al ayudante. `true` si salió; si no, ya avisó por qué. */
async function porElAyudante(nodo: HTMLElement): Promise<boolean> {
  const largo = largoDeLaBoleta(medirBoleta(nodo));
  const documento = documentoDeBoleta({
    estilos: [estilosDeLaBoleta(nodo)],
    base: `${location.origin}/`,
    clases: `${document.documentElement.className} ${document.body.className}`.trim(),
    boleta: nodo.outerHTML,
    largo,
  });
  let status: number | null = null;
  let cuerpo: unknown = null;
  try {
    const r = await fetch(`${URL_AYUDANTE}/imprimir?tipo=ticket&largo=${largo}`, {
      method: "POST",
      headers: { "Content-Type": "text/html" },
      body: documento,
      signal: AbortSignal.timeout(20_000),
    });
    status = r.status;
    cuerpo = await r.json().catch(() => null);
  } catch {
    status = null;
  }
  const fallo = resultadoDeBoleta(status, cuerpo);
  if (!fallo) return true;
  // Algo cambió en esta Mac (se desconectó la ticketera, se detuvo el ayudante): se vuelve a preguntar en la próxima.
  conocido = null;
  avisar.error(fallo.texto, { detalle: fallo.detalle });
  return false;
}

/** El cuadro de impresión de Chrome (sin cuadro en una ventana con `--kiosk-printing`). Termina con `afterprint`, o a los 4 s si el
 *  navegador no lo emite: sin ese respaldo la hoja quedaría trabada. */
const porElCuadro = () =>
  new Promise<void>((listo) => {
    let hecho = false;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      window.removeEventListener("afterprint", terminar);
      window.clearTimeout(respaldo);
      listo();
    };
    window.addEventListener("afterprint", terminar);
    const respaldo = window.setTimeout(terminar, 4000);
    window.print();
  });

/**
 * Imprime la boleta montada. Por el ayudante avisa «Ticket enviado a la ticketera». `conCuadro: false` (la estación de la caja) no avisa ni cae nunca al cuadro: en una ventana minimizada el cuadro
 * se quedaría abierto sin que nadie lo vea, y la boleta vuelve a la cola.
 */
export async function imprimirBoleta({ conCuadro = true }: { conCuadro?: boolean } = {}): Promise<FinBoleta> {
  const nodo = document.getElementById(ID);
  if (nodo && (await comprobarBoletasPorAyudante())) {
    if (await porElAyudante(nodo)) {
      // Sin cuadro no hay nada que diga que salió: el aviso lo dice (la estación, que imprime sola, no avisa).
      if (conCuadro) avisar.exito("Ticket enviado a la ticketera");
      return "impresa";
    }
    if (!conCuadro) return "fallo";
  }
  // Sin el ayudante, solo la ventana «CAYLA Caja» imprime sin cuadro.
  if (!conCuadro && ventanaDelEquipo.leer() !== "caja") return "fallo";
  if (!sePuedeImprimirAqui("ticket")) return "frenada";
  await porElCuadro();
  return "cuadro";
}
