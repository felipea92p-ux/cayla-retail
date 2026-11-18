"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/* ====================================================================
   «Ver más / Ver menos» — una sola pieza (ADR-0358, ronda 15, Felipe eligió P1 el 2026-10-15)

   Una lista muestra sus primeras filas y guarda las demás. La pieza es la franja de Inicio de Almacén:
   · `forma="pie"` (de fábrica): a todo el ancho, al pie de la tarjeta, sobre una raya; «Ver 3 más» en taupe con la flecha hacia abajo.
   · `forma="enlace"`: la misma frase y la misma flecha como enlace, para una lista suelta (fuera de una tarjeta).
   Al abrir dice «Ver menos» y la flecha da media vuelta; las filas de más bajan EN SU LUGAR con <FilasDeMas> (0fr → 1fr, 400 ms, sin
   medir alturas) y, cerradas, quedan `inert`: ni se ven ni se alcanzan con el teclado. Registro: docs/unificar/accion.siguiente.md.
   Nunca un «Ver más» ni un «Ver menos» a mano.
   ==================================================================== */

export function BotonVerMas({
  abierto,
  onCambiar,
  texto,
  forma = "pie",
  controla,
  className = "",
  "data-guia": guia,
}: {
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
  /** Lo que dice cerrado: «Ver 3 más», «Ver las 12», «Ver 4 pendientes más». Abierto dice «Ver menos». */
  texto: ReactNode;
  forma?: "pie" | "enlace";
  /** El id de lo que abre (aria-controls). */
  controla?: string;
  /** Solo posición (márgenes), nunca la cara. */
  className?: string;
  "data-guia"?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCambiar(!abierto)}
      aria-expanded={abierto}
      aria-controls={controla}
      data-guia={guia}
      className={`${forma === "pie" ? "ver-mas-pie" : "btn-cayla btn-enlace ver-mas-enlace"} ${className}`}
    >
      {abierto ? "Ver menos" : texto}
      <ChevronDown aria-hidden className="ver-mas-flecha" />
    </button>
  );
}

/** Las filas que la lista guarda: bajan en su lugar al abrir y, cerradas, no se alcanzan con el teclado.
 *
 *  Ctrl+F las encuentra (2026-11-18, maqueta `docs/maquetas/mejoras-componentes-2026-11/`): cerradas, ya plegadas, pasan de `inert` a
 *  `hidden="until-found"`, que las sigue escondiendo y sacando del teclado pero deja que el buscador del navegador (y un enlace
 *  `#:~:text=`) las encuentre. Al encontrar algo, el navegador avisa con `beforematch` y la lista se abre con SU manera de siempre:
 *  `alEncontrar` si se pasa, o el botón que la controla (`aria-controls` = su `id`, como `<BotonVerMas controla>`). Sin ninguno de los
 *  dos, queda como antes (`inert`). Se ve y se mueve igual: `hidden` llega recién cuando terminó de plegarse, y el servidor la dibuja
 *  `inert` como siempre. Sin `hidden="until-found"` (Safari) el atributo se lee como `hidden` a secas: sigue escondida, no se encuentra. */
export function FilasDeMas({
  abierto,
  id,
  alEncontrar,
  children,
  className = "",
}: {
  abierto: boolean;
  id?: string;
  /** Abre la lista cuando el buscador del navegador encuentra algo adentro. Sin él, se aprieta el botón con `aria-controls` = `id`. */
  alEncontrar?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const dentro = useRef<HTMLDivElement>(null);
  const buscable = !!alEncontrar || !!id;
  const alEncontrarVivo = useRef(alEncontrar);
  useEffect(() => {
    alEncontrarVivo.current = alEncontrar;
  });

  useEffect(() => {
    const el = dentro.current;
    if (!el || !buscable) return;
    const abrir = () => {
      if (alEncontrarVivo.current) return alEncontrarVivo.current();
      const boton = id ? document.querySelector<HTMLElement>(`[aria-controls~="${CSS.escape(id)}"]`) : null;
      if (boton && boton.getAttribute("aria-expanded") !== "true") boton.click();
    };
    el.addEventListener("beforematch", abrir);
    return () => el.removeEventListener("beforematch", abrir);
  }, [buscable, id]);

  useEffect(() => {
    const fila = caja.current;
    const el = dentro.current;
    if (!fila || !el || !buscable) return;
    if (abierto) {
      el.removeAttribute("hidden");
      return;
    }
    // Recién plegada: se espera a que termine el pliegue (con las animaciones apagadas, ADR-0625, dura ~0) para no cortarlo.
    const segundos = Math.max(0, ...getComputedStyle(fila).transitionDuration.split(",").map((t) => parseFloat(t) || 0));
    const ocultar = () => {
      el.setAttribute("hidden", "until-found");
      fila.inert = false; // `inert` le ganaría al buscador; `hidden="until-found"` ya la saca del teclado
    };
    if (segundos < 0.02) {
      ocultar();
      return;
    }
    const reloj = window.setTimeout(ocultar, segundos * 1000 + 60);
    return () => window.clearTimeout(reloj);
  }, [abierto, buscable]);

  return (
    <div ref={caja} id={id} className={`filas-de-mas ${className}`} data-abierto={abierto || undefined} inert={!abierto}>
      <div ref={dentro}>{children}</div>
    </div>
  );
}
