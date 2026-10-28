"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDestinoFlotante } from "@/components/ui/useAnclaje";

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

  // El globo cuelga fuera de la caja que contiene al «!» (2026-10-13): en `position: fixed`, en la capa flotante de la hoja
  // si el «!» vive dentro de un <Modal>, o en body si no (`useDestinoFlotante`, ADR-0211). Antes era `absolute` y se recortaba
  // al borde de la hoja o del panel que scrollea: en «Plan de Polos» la explicación de «Bueno» quedaba cortada contra la
  // hoja. Ahora solo la pantalla lo limita: se acomoda dentro de la ventana, debajo del botón o, si no cabe, arriba. Se
  // escribe directo en el estilo (no en estado) y en `useLayoutEffect`, así el primer cuadro ya sale bien puesto; y se
  // recalcula al hacer scroll (con captura, también el de la hoja) o redimensionar.
  const destino = useDestinoFlotante(ref, abierto);
  useLayoutEffect(() => {
    if (!abierto || !destino) return;
    const colocar = () => {
      const raiz = ref.current;
      const globo = globoRef.current;
      if (!raiz || !globo) return;
      const margen = 8;
      // El ancho del documento y no `window.innerWidth`: en el celular, si algo se sale por la derecha, el navegador agranda la
      // ventana «visible» y el globo se colocaba contra ese borde nuevo, fuera de la pantalla (2026-10-09, «!» de Productos).
      const anchoVentana = document.documentElement.clientWidth || window.innerWidth;
      const ancho = Math.min(288, anchoVentana - 2 * margen);
      globo.style.width = `${ancho}px`;
      const r = raiz.getBoundingClientRect();
      globo.style.left = `${Math.min(Math.max(margen, r.left), anchoVentana - margen - ancho)}px`;
      const alto = globo.offsetHeight;
      const cabeAbajo = r.bottom + 8 + alto + margen <= window.innerHeight;
      const cabeArriba = r.top - 8 - alto - margen >= 0;
      const arriba = !cabeAbajo && cabeArriba;
      globo.style.top = arriba ? "auto" : `${r.bottom + 8}px`;
      globo.style.bottom = arriba ? `${window.innerHeight - r.top + 8}px` : "auto";
    };
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => {
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
    };
  }, [abierto, destino]);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !globoRef.current?.contains(t)) setAbierto(false);
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
      {abierto && destino && createPortal(
        // normal-case + tracking-normal + font-sans: la explicación no debe heredar las
        // versalitas ni el tracking de una etiqueta `label-cayla` que la contenga. Tampoco el
        // `whitespace-nowrap` de un título que no se parte: sin `whitespace-normal`, el texto corría
        // de largo y se salía del globo (Resultados ▸ «¿Cómo va?», 2026-10-12).
        // Posición y ancho los pone `useLayoutEffect` de arriba (estilo en línea); acá solo el
        // aspecto. `w-64` es el ancho de respaldo si el efecto no llegara a correr.
        // Al estar en un portal, React sube sus clics por el árbol de React: se cortan aquí para que un «!» dentro de una
        // fila o una tarjeta clicable no la active al tocar la explicación (ADR-0128, 2026-09-26).
        <span
          ref={globoRef}
          onClick={(e) => e.stopPropagation()}
          className="anim-globo fixed left-0 top-0 z-40 block w-64 whitespace-normal rounded-lg border border-sand bg-papel p-3.5 text-left font-sans normal-case tracking-normal shadow-md"
        >
          {titulo && <span className="label-cayla mb-1 block text-[11px] text-rojo">{titulo}</span>}
          <span className="block text-xs font-normal leading-relaxed text-tinta/80 normal-case tracking-normal">{children}</span>
        </span>,
        destino,
      )}
    </span>
  );
}
