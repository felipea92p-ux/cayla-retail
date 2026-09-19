"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { desplazamientos, indiceSiguiente } from "@/lib/comprobantes-lista-movimiento";

/* ====================================================================
   ComprobantesListaFilas · el envoltorio cliente de las filas de /compras
   (2026-09-19, ADR-0136)

   La lista sigue siendo del servidor: `page.tsx` pide ≤ 50 filas a Postgres y las dibuja como
   `<Link>` (cada fila abre el detalle como modal interceptado). Este componente NO las dibuja:
   las recibe ya hechas como `children` y solo les agrega dos cosas que necesitan el DOM.

   1. REACOMODO (FLIP). Cambiar de pestaña, de orden o de búsqueda es una navegación: el servidor manda
      las filas nuevas y React conserva en el DOM las que tienen la misma `key` (el id del comprobante).
      Antes de pintar (`useLayoutEffect`) se compara dónde estaba cada fila con dónde quedó y se anima la
      diferencia con la Web Animations API (solo `transform`, no dispara layout por fotograma). Las que
      se quedan se DESLIZAN; las que llegan entran con el desfase de su clase `cmp-fila` (CSS); las que
      se van desaparecen sin más. Nunca se re-anima toda la tabla: lo que no cambió no se toca.
      Cada fila se identifica con `data-flip={id}`. Se mide `offsetTop` (relativo a este contenedor y
      sin transformaciones), no `getBoundingClientRect`: así la entrada escalonada de otra fila, que
      sube 8 px, no contamina la medida. Solo se anima cuando cambió `clave` (los ids en su orden), como
      `useFlip`; se mide en cada render para que la posición «anterior» nunca esté vieja.

      Por qué no `useFlip` (lib/useFlip.ts): pide un `ref` por fila, y estas filas nacen en el servidor,
      donde no se pueden pasar funciones. Aquí el contenedor las encuentra por `data-flip`.

   2. TECLADO. `j` / `k` mueven el FOCO DEL NAVEGADOR de una fila a la siguiente/anterior; como cada fila es
      un enlace, `Enter` la abre con el comportamiento nativo y el foco visible sale gratis. No se
      captura nada dentro de un campo, con Ctrl/⌘/Alt ni con un modal abierto.

   El servidor puede pasar `children` con cualquier fila mientras lleven `data-flip`. El contenedor es
   `relative` para que `offsetTop` de las filas sea relativo a él.
   ==================================================================== */

const EASE_CAYLA = "cubic-bezier(0.32, 0.72, 0.24, 1)"; // = --ease-cayla (globals.css)
const DURACION_MS = 460;
/** Tras la primera entrada (300 ms de espera + 420 ms + escalonado) las filas nuevas dejan de esperar a la cabecera. */
const ENTRADA_INICIAL_MS = 1500;

export function ComprobantesListaFilas({ clave, children, className = "" }: { clave: string; children: ReactNode; className?: string }) {
  const cont = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  const claveAnterior = useRef(clave);

  // Sin lista de dependencias a propósito (mismo criterio que `useFlip`): se MIDE en cada render para que
  // `tops` no quede viejo, pero solo se ANIMA cuando cambió el orden o el conjunto de filas.
  useLayoutEffect(() => {
    const el = cont.current;
    if (!el) return;
    const ahora = new Map<string, number>();
    for (const hija of Array.from(el.children)) {
      if (hija instanceof HTMLElement && hija.dataset.flip) ahora.set(hija.dataset.flip, hija.offsetTop);
    }
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (claveAnterior.current !== clave && !reducido) {
      for (const { id, dy } of desplazamientos(tops.current, ahora)) {
        const fila = Array.from(el.children).find((h): h is HTMLElement => h instanceof HTMLElement && h.dataset.flip === id);
        fila?.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: DURACION_MS, easing: EASE_CAYLA });
      }
    }
    claveAnterior.current = clave;
    tops.current = ahora;
  });

  // Pasada la entrada de la pantalla, las filas que lleguen después (cambio de pestaña o de búsqueda) entran
  // sin la espera inicial: el CSS lo lee de `data-listo`.
  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      el.dataset.listo = "";
    }, ENTRADA_INICIAL_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.key !== "j" && e.key !== "k") || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const filas = Array.from(cont.current?.querySelectorAll<HTMLElement>("[data-flip]") ?? []);
      if (filas.length === 0) return;
      e.preventDefault();
      const actual = filas.findIndex((f) => f === document.activeElement || f.contains(document.activeElement));
      filas[indiceSiguiente(actual, filas.length, e.key === "j" ? 1 : -1)]?.focus();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  return (
    <div ref={cont} className={`cmp-filas relative divide-y divide-tinta/10 ${className}`}>
      {children}
    </div>
  );
}
