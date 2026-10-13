"use client";

/**
 * La mitad izquierda del login: «El vuelo» (Felipe 2026-10-13; maqueta `docs/maquetas/login-2026-10/`, `?v=C2`).
 *
 * El colibrí sale chiquito de Trujillo, pasa por Arequipa y Lima dejando una costura punteada, da la vuelta y sube a su lugar;
 * cada sede se rellena cuando el hilo pasa por ella. Corre UNA vez al entrar, sin rebote ni bucle (excepción aprobada en
 * ADR-0136, act. 2026-10-13); con `prefers-reduced-motion`, o si la ventana cambia de tamaño a medio vuelo, se ve terminado.
 * Solo se ve en pantallas anchas (lg); en el celular el login es el formulario con la marca arriba.
 * La geometría vive en `lib/login-vuelo.ts`; estilos en `app/estilos/login.css`.
 */

import { useEffect, useId, useRef } from "react";
import { IsotipoCayla } from "@/components/ui/IsotipoCayla";
import {
  COLA_DEL_AVE,
  DURACION_DEL_VUELO,
  escalaDelAve,
  poseDelAve,
  ritmoDelVuelo,
  trazoDelVuelo,
  type Punto,
} from "@/lib/login-vuelo";

// Las tres sedes, en el orden en que el hilo las cose. El login se ve antes de entrar: no puede leer `ubicaciones`.
const SEDES = [
  { codigo: "TRU", nombre: "Trujillo" },
  { codigo: "AQP", nombre: "Arequipa" },
  { codigo: "LIM", nombre: "Lima" },
];

export function PanelVuelo() {
  const mascaraId = `hilo-${useId().replace(/:/g, "")}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const aveRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<SVGSVGElement>(null);
  const hiloRef = useRef<SVGPathElement>(null);
  const mascaraRef = useRef<SVGPathElement>(null);
  const ojalesRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const panel = panelRef.current;
    const ave = aveRef.current;
    const lienzo = lienzoRef.current;
    const hilo = hiloRef.current;
    const mascara = mascaraRef.current;
    const ojales = ojalesRef.current.filter((o): o is HTMLElement => o !== null);
    if (!panel || !ave || !lienzo || !hilo || !mascara || ojales.length === 0) return;

    let cuadro = 0;
    let largo = 0;
    let marcas: number[] = [];
    let destino: Punto = { x: 0, y: 0 };

    /** Mide el panel y arma el recorrido. Devuelve false si el panel no se ve (celular). */
    const medir = () => {
      const caja = panel.getBoundingClientRect();
      if (caja.width === 0) return false;
      const centro = (el: Element): Punto => {
        const r = el.getBoundingClientRect();
        return { x: r.left - caja.left + r.width / 2, y: r.top - caja.top + r.height / 2 };
      };
      ave.style.transform = "none";
      const r = ave.getBoundingClientRect();
      destino = { x: r.left - caja.left + r.width * COLA_DEL_AVE.x, y: r.top - caja.top + r.height * COLA_DEL_AVE.y };
      const sedes = ojales.map(centro);
      const d = trazoDelVuelo({ ancho: caja.width, alto: caja.height, sedes, destino });
      lienzo.setAttribute("viewBox", `0 0 ${caja.width} ${caja.height}`);
      hilo.setAttribute("d", d);
      mascara.setAttribute("d", d);
      largo = hilo.getTotalLength();
      // El hilo va recto de la primera sede a la última: la parte del largo en que llega a cada una es su distancia en x.
      marcas = sedes.map((s) => (largo > 0 ? (s.x - sedes[0].x) / largo : 0));
      return true;
    };

    const pintarHilo = (t: number) => {
      mascara.style.strokeDasharray = `${largo} ${largo}`;
      mascara.style.strokeDashoffset = String(largo * (1 - t));
      ojales.forEach((o, i) => o.toggleAttribute("data-cosido", t >= marcas[i] - 0.001));
    };

    const terminar = () => {
      cancelAnimationFrame(cuadro);
      if (!medir()) return;
      ave.style.transform = "none";
      pintarHilo(1);
      panel.setAttribute("data-llego", "");
    };

    const alCambiarTamano = () => terminar();
    window.addEventListener("resize", alCambiarTamano);

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || !medir()) {
      terminar();
      return () => window.removeEventListener("resize", alCambiarTamano);
    }

    let pose = { giro: 1, inclinacion: 0 };
    let inicio: number | null = null;
    const paso = (ahora: number) => {
      inicio ??= ahora;
      const u = Math.min(1, (ahora - inicio) / DURACION_DEL_VUELO);
      const t = ritmoDelVuelo(u);
      const p = hilo.getPointAtLength(largo * t);
      const q = hilo.getPointAtLength(Math.min(largo, largo * t + 2));
      pose = poseDelAve(pose, { dx: q.x - p.x, dy: q.y - p.y }, u);
      const esc = escalaDelAve(t);
      ave.style.transform =
        u < 1
          ? `translate(${p.x - destino.x}px, ${p.y - destino.y}px) rotate(${pose.inclinacion * Math.sign(pose.giro)}deg) scale(${esc * pose.giro}, ${esc})`
          : "none";
      pintarHilo(t);
      if (u < 1) cuadro = requestAnimationFrame(paso);
      else panel.setAttribute("data-llego", "");
    };
    panel.setAttribute("data-volando", "");
    cuadro = requestAnimationFrame(paso);

    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("resize", alCambiarTamano);
    };
  }, []);

  return (
    <div ref={panelRef} className="login-panel" aria-hidden>
      <p className="login-panel-marca">
        <span>CAYLA</span>
        <small>Retail</small>
      </p>

      <div ref={aveRef} className="login-ave">
        <IsotipoCayla color="currentColor" grosor={4} className="h-full w-full overflow-visible" />
      </div>

      <svg ref={lienzoRef} className="login-hilo">
        <defs>
          <mask id={mascaraId} maskUnits="userSpaceOnUse">
            <path ref={mascaraRef} className="login-hilo-mascara" />
          </mask>
        </defs>
        <path ref={hiloRef} className="login-hilo-trazo" mask={`url(#${mascaraId})`} />
      </svg>

      <p className="login-lema">
        Donde el estilo <em>transforma.</em>
      </p>

      <ul className="login-sedes">
        {SEDES.map((s, i) => (
          <li key={s.codigo}>
            <i
              ref={(el) => {
                ojalesRef.current[i] = el;
              }}
              className="login-ojal"
            />
            <small>{s.codigo}</small>
            <b>{s.nombre}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
