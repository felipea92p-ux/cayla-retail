"use client";

import { useEffect, useRef } from "react";
import { pixelesDeLente } from "@/lib/estados-tela";

const SVG = "http://www.w3.org/2000/svg";

// Qué placas llevan lente: a la grande, un canto más ancho y que desvía más.
const PIEZAS = [
  { selector: ".estados-heroe", banda: 34, fuerza: 72 },
  { selector: ".estados-cabecera, .estados-vidrio .pestanas-cayla", banda: 22, fuerza: 46 },
];

function mapaComoImagen(ancho: number, alto: number, radio: number, banda: number): string {
  const { w, h, datos } = pixelesDeLente(ancho, alto, radio, banda);
  const lienzo = document.createElement("canvas");
  lienzo.width = w;
  lienzo.height = h;
  const c = lienzo.getContext("2d");
  c?.putImageData(new ImageData(new Uint8ClampedArray(datos), w, h), 0, 0);
  return lienzo.toDataURL();
}

/**
 * La lente de Estados financieros (ADR-0611): el borde de cada placa desvía los hilos que pasan detrás, como el canto de un vidrio. Solo donde el navegador lo sabe hacer
 * (Chromium), con pantalla ancha y sin que la persona haya pedido menos movimiento, menos transparencia o más contraste: en los demás casos la placa sigue siendo vidrio, sin
 * ese detalle. Se mide cada placa y se vuelve a dibujar solo si cambió de tamaño.
 */
export function LentesDeVidrio() {
  const filtros = useRef<SVGDefsElement>(null);

  useEffect(() => {
    const permitido =
      /Chrome\//.test(navigator.userAgent) &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches &&
      !window.matchMedia("(prefers-reduced-transparency: reduce)").matches &&
      !window.matchMedia("(prefers-contrast: more)").matches;
    const raiz = filtros.current?.closest(".estados-vidrio");
    if (!permitido || !raiz) return;
    const conLente = new Map<string, HTMLElement>();
    let n = 0;
    let reloj = 0;

    function poner() {
      // Las placas de una pantalla que ya se fue sueltan su filtro.
      for (const [id, el] of conLente) {
        if (el.isConnected) continue;
        conLente.delete(id);
        document.getElementById(id)?.remove();
      }
      for (const { selector, banda, fuerza } of PIEZAS) {
        for (const el of raiz!.querySelectorAll<HTMLElement>(selector)) {
          const w = Math.round(el.offsetWidth);
          const h = Math.round(el.offsetHeight);
          if (w < 40 || h < 30 || window.innerWidth < 760) {
            if (el.dataset.lente) {
              el.style.removeProperty("backdrop-filter");
              el.dataset.tamLente = "";
            }
            continue;
          }
          const tam = `${w}x${h}`;
          if (el.dataset.tamLente === tam) continue;
          el.dataset.tamLente = tam;
          const id = el.dataset.lente ?? `lente-estados-${++n}`;
          el.dataset.lente = id;
          conLente.set(id, el);
          document.getElementById(id)?.remove();
          const radio = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 30, Math.min(w, h) / 2);
          const f = document.createElementNS(SVG, "filter");
          f.id = id;
          for (const [k, v] of Object.entries({ x: "0", y: "0", width: String(w), height: String(h), filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" })) f.setAttribute(k, v);
          const imagen = document.createElementNS(SVG, "feImage");
          for (const [k, v] of Object.entries({ href: mapaComoImagen(w, h, radio, banda), x: "0", y: "0", width: String(w), height: String(h), preserveAspectRatio: "none", result: "mapa" })) imagen.setAttribute(k, v);
          const desvio = document.createElementNS(SVG, "feDisplacementMap");
          for (const [k, v] of Object.entries({ in: "SourceGraphic", in2: "mapa", scale: String(fuerza), xChannelSelector: "R", yChannelSelector: "G" })) desvio.setAttribute(k, v);
          f.append(imagen, desvio);
          filtros.current?.appendChild(f);
          el.style.setProperty("backdrop-filter", `url(#${id}) blur(5px) saturate(1.35)`);
        }
      }
    }

    const luego = () => {
      window.clearTimeout(reloj);
      reloj = window.setTimeout(poner, 180);
    };
    poner();
    const tamano = new ResizeObserver(luego);
    tamano.observe(raiz);
    // Al pasar de un estado a otro nacen placas nuevas.
    const cambios = new MutationObserver(luego);
    cambios.observe(raiz, { childList: true, subtree: true });
    window.addEventListener("resize", luego);
    return () => {
      window.clearTimeout(reloj);
      tamano.disconnect();
      cambios.disconnect();
      window.removeEventListener("resize", luego);
    };
  }, []);

  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs ref={filtros} />
    </svg>
  );
}
