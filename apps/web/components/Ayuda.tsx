"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** El rectángulo que de verdad se ve alrededor de `el`: la ventana recortada por cada
 *  ancestro que corta lo que se sale (`overflow` distinto de `visible`, como el panel del
 *  ticket de Vender, que scrollea por dentro). Un globo `absolute` no se ve de ese rectángulo
 *  para afuera. */
function limitesVisibles(el: HTMLElement) {
  let left = 0;
  let top = 0;
  let right = window.innerWidth;
  let bottom = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const e = getComputedStyle(p);
    if (e.overflowX === "visible" && e.overflowY === "visible") continue;
    const c = p.getBoundingClientRect();
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  return { left, top, right, bottom };
}

// Botón de ayuda "(!)" — se toca y explica un concepto en lenguaje CAYLA, sin
// tecnicismos (protocolo de docencia: dejar a Felipe más capaz de discutir, no de
// aplaudir). Estilo de marca: sutil en tinta, se enciende en rojo al pasar/abrir.
// Cero librerías, cierra al tocar afuera o con Escape.
//
// `tono="falta"` (ticket de Vender, 2026-09-14): el mismo (!) y el mismo globo, pero
// ya encendido en rojo porque falta algo de verdad — quien lo pinta decide CUÁNDO
// mostrarlo, y el globo dice QUÉ falta. El default deja el resto de las pantallas
// exactamente como estaban.
export function Ayuda({
  titulo,
  tono = "ayuda",
  children,
}: {
  titulo?: string;
  tono?: "ayuda" | "falta";
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const globoRef = useRef<HTMLSpanElement>(null);

  // Al abrir, el globo se acomoda DENTRO de lo visible (2026-09-18): antes iba siempre
  // pegado al borde izquierdo del botón, con ancho fijo, y cerca del borde derecho del panel
  // del ticket se cortaba a media frase. Se escribe directo en el estilo (no en estado) y en
  // `useLayoutEffect`, así el primer cuadro ya sale bien puesto y no hay parpadeo. También
  // al hacer scroll/redimensionar mientras está abierto.
  useLayoutEffect(() => {
    if (!abierto) return;
    const colocar = () => {
      const raiz = ref.current;
      const globo = globoRef.current;
      if (!raiz || !globo) return;
      const lim = limitesVisibles(raiz);
      const margen = 8;
      const ancho = Math.min(288, lim.right - lim.left - 2 * margen);
      globo.style.width = `${ancho}px`;
      const r = raiz.getBoundingClientRect();
      const left = Math.min(Math.max(lim.left + margen, r.left), lim.right - margen - ancho);
      globo.style.left = `${left - r.left}px`;
      // Debajo del botón; si no cabe abajo pero sí arriba, arriba.
      const alto = globo.offsetHeight;
      const cabeAbajo = r.bottom + 8 + alto + margen <= lim.bottom;
      const cabeArriba = r.top - 8 - alto - margen >= lim.top;
      const arriba = !cabeAbajo && cabeArriba;
      globo.style.top = arriba ? "auto" : "1.75rem";
      globo.style.bottom = arriba ? "1.75rem" : "auto";
    };
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => {
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", alTocarAfuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alTocarAfuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto((v) => !v); }}
        aria-label={tono === "falta" ? `Falta: ${titulo ?? "algo por completar"}` : titulo ? `Qué es ${titulo}` : "Más información"}
        // h-5 y no h-4: con la etiqueta ya en 11px, el "!" se desbordaba de un
        // círculo de 16px. `active:scale-90` da el acuse de tacto que faltaba.
        className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold leading-none transition-all active:scale-90 ${
          abierto
            ? "border-rojo bg-rojo text-crema"
            : tono === "falta"
              ? "border-rojo bg-rojo/8 text-rojo hover:bg-rojo hover:text-crema"
              : "border-tinta/30 text-tinta/65 hover:border-rojo hover:bg-rojo/8 hover:text-rojo"
        }`}
      >
        !
      </button>
      {abierto && (
        // normal-case + tracking-normal + font-sans: la explicación no debe heredar las
        // versalitas ni el tracking de una etiqueta `label-cayla` que la contenga.
        // Posición y ancho los pone `useLayoutEffect` de arriba (estilo en línea); acá solo el
        // aspecto. `w-64` es el ancho de respaldo si el efecto no llegara a correr.
        <span ref={globoRef} className="anim-globo absolute left-0 top-7 z-40 block w-64 rounded-lg border border-sand bg-papel p-3.5 text-left font-sans normal-case tracking-normal shadow-md">
          {titulo && <span className="label-cayla mb-1 block text-[11px] text-rojo">{titulo}</span>}
          <span className="block text-xs font-normal leading-relaxed text-tinta/80 normal-case tracking-normal">{children}</span>
        </span>
      )}
    </span>
  );
}
