"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CAPAS_DE_HILOS, corrimientoDeCapa, esElHiloRojo, estadoDeLaRuta, mouseEnLaTela, puntosDelHilo, tamanoDelLienzo } from "@/lib/estados-tela";

// El fondo de Estados financieros (ADR-0611): la tela que le da al vidrio algo que desviar. Felipe eligió «Hilos» mirando ocho fondos en la maqueta. Se pinta una vez y solo se
// vuelve a pintar si cambia el tamaño de la ventana o el tema, y los colores salen de los tokens. Lo único que se mueve: las capas se reacomodan al cambiar de pestaña y siguen al
// mouse unos pocos píxeles (nunca se mueven solas). Con «reducir movimiento» se queda quieta. También lleva el brillo del vidrio, que sigue al mouse.

const PLACA = ".placa-estados";

function pintar(lienzos: readonly (HTMLCanvasElement | null)[]) {
  const estilo = getComputedStyle(document.documentElement);
  const hilo = estilo.getPropertyValue("--hilos-hilo").trim();
  const rojo = estilo.getPropertyValue("--color-rojo").trim();
  const { ancho, alto } = tamanoDelLienzo(window.innerWidth, window.innerHeight);
  lienzos.forEach((lienzo, capa) => {
    const x = lienzo?.getContext("2d");
    if (!lienzo || !x) return;
    lienzo.width = ancho;
    lienzo.height = alto;
    x.lineCap = "round";
    for (const haz of CAPAS_DE_HILOS[capa] ?? []) {
      for (let i = 0; i < haz.n; i++) {
        const esRojo = esElHiloRojo(haz, i);
        x.strokeStyle = esRojo ? rojo : hilo;
        x.globalAlpha = esRojo ? 0.92 : 0.42;
        x.lineWidth = esRojo ? 2 : 1;
        x.beginPath();
        puntosDelHilo(haz, i, ancho, alto).forEach(([px, py], j) => (j ? x.lineTo(px, py) : x.moveTo(px, py)));
        x.stroke();
      }
    }
    x.globalAlpha = 1;
  });
}

export function TelaHilos() {
  const lienzos = useRef<(HTMLCanvasElement | null)[]>([]);
  const mouse = useRef({ x: 0, y: 0 });
  const estado = estadoDeLaRuta(usePathname());
  const estadoActual = useRef(estado);

  const colocar = () => {
    lienzos.current.forEach((lienzo, capa) => {
      if (!lienzo) return;
      const { x, y } = corrimientoDeCapa(estadoActual.current, capa, mouse.current.x, mouse.current.y);
      lienzo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  };

  // Se pinta al llegar, al cambiar el tamaño de la ventana y al cambiar de tema.
  useEffect(() => {
    pintar(lienzos.current);
    let reloj: number | undefined;
    const alCambiarTamano = () => {
      window.clearTimeout(reloj);
      reloj = window.setTimeout(() => pintar(lienzos.current), 180);
    };
    window.addEventListener("resize", alCambiarTamano, { passive: true });
    const tema = new MutationObserver(() => pintar(lienzos.current));
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    return () => {
      window.clearTimeout(reloj);
      window.removeEventListener("resize", alCambiarTamano);
      tema.disconnect();
    };
  }, []);

  // Al cambiar de pestaña, los hilos se reacomodan.
  useEffect(() => {
    estadoActual.current = estado;
    colocar();
  }, [estado]);

  // El mouse: la tela se corre unos píxeles y la placa de vidrio bajo el puntero enciende su brillo. Con el dedo no pasa nada: no hay puntero que seguir.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cuadro = 0;
    let ultimo: PointerEvent | null = null;
    let encendida: HTMLElement | null = null;
    const aplicar = () => {
      cuadro = 0;
      if (!ultimo) return;
      mouse.current = { x: mouseEnLaTela(ultimo.clientX, window.innerWidth), y: mouseEnLaTela(ultimo.clientY, window.innerHeight) };
      colocar();
      const placa = ultimo.target instanceof Element ? ultimo.target.closest<HTMLElement>(PLACA) : null;
      if (encendida && encendida !== placa) encendida.style.setProperty("--brillo", "0");
      encendida = placa;
      if (placa) {
        const r = placa.getBoundingClientRect();
        placa.style.setProperty("--mx", `${ultimo.clientX - r.left}px`);
        placa.style.setProperty("--my", `${ultimo.clientY - r.top}px`);
        placa.style.setProperty("--brillo", "1");
      }
    };
    const alMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      ultimo = e;
      if (!cuadro) cuadro = requestAnimationFrame(aplicar);
    };
    window.addEventListener("pointermove", alMover, { passive: true });
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("pointermove", alMover);
    };
  }, []);

  return (
    <div aria-hidden className="tela-hilos">
      {CAPAS_DE_HILOS.map((_, capa) => (
        <canvas
          key={capa}
          ref={(lienzo) => {
            lienzos.current[capa] = lienzo;
          }}
        />
      ))}
    </div>
  );
}
