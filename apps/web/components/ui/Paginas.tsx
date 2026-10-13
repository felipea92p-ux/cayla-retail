"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
// Relativo (no `@/`): la prueba la dibuja sin el alias (lib/paginas.test.ts).
import { numerosDePagina } from "../../lib/paginacion";

/* ====================================================================
   Paginas · los números de página de una lista larga (ADR-0358, ronda 8: Felipe la eligió tocándola el 2026-10-13).

   Una sola pieza para las dos paginaciones con número: la que la pantalla ya tiene en memoria (`onPagina`, botones) y la de la URL
   (`hrefDe`, enlaces). Números de 13 px en letra normal, cuadrados de 32 px (36 con `grande`), y la página actual es una PÍLDORA DE
   TINTA QUE SE DESLIZA de un número al otro (la misma idea que la pestaña de modo de la ronda 1). Las flechas se corren 2 px hacia
   donde llevan al pasar el mouse.

   La píldora se mide en el navegador (`offsetLeft` del número actual). Antes de medir —el HTML del servidor, o sin JavaScript— el
   número actual se pinta de tinta él mismo, así nunca hay un instante sin página marcada. En la paginación por URL la pieza no se
   desmonta al navegar (App Router), así que la píldora también viaja de la página vieja a la nueva.

   El rango («1–8 de 64») lo escribe quien la usa, a su izquierda: cada lista cuenta lo suyo. Estilos:
   `app/estilos/enlaces-paginas-caras.css`. Movimiento de ADR-0136 (sin rebote; quieta con `prefers-reduced-motion`).
   ==================================================================== */

export function Paginas({
  pagina,
  totalPaginas,
  onPagina,
  hrefDe,
  hrefs,
  grande = false,
}: {
  pagina: number;
  totalPaginas: number;
  /** En memoria: cambiar de página no va a la base ni a la URL. */
  onPagina?: (pagina: number) => void;
  /** Por URL, desde un componente cliente: el enlace de cada página. */
  hrefDe?: (pagina: number) => string;
  /** Por URL, desde un Server Component (una función no cruza al cliente): el enlace de cada página, `hrefs[n - 1]`. */
  hrefs?: string[];
  /** Cuadrados de 36 px: una lista que se recorre a menudo con el mouse (Marcas). */
  grande?: boolean;
}) {
  const nav = useRef<HTMLElement>(null);
  const [pista, setPista] = useState<{ x: number; w: number } | null>(null);
  // La primera medida no anima (la píldora no viaja desde el borde al cargar); las siguientes sí.
  const [quieta, setQuieta] = useState(true);

  useLayoutEffect(() => {
    const actual = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!actual) return;
    setPista({ x: actual.offsetLeft, w: actual.offsetWidth });
    const t = window.setTimeout(() => setQuieta(false), 30);
    return () => window.clearTimeout(t);
  }, [pagina, totalPaginas]);

  if (totalPaginas <= 1) return null;

  const clase = (extra = "") => `paginas-n ${extra}`;
  const enlace = hrefDe ?? (hrefs ? (n: number) => hrefs[Math.min(Math.max(n, 1), hrefs.length) - 1] : undefined);
  const ir = (destino: number, contenido: ReactNode, props: { etiqueta?: string; actual?: boolean; deshabilitada?: boolean; extra?: string }) => {
    const comunes = {
      "aria-label": props.etiqueta,
      "aria-current": props.actual ? ("page" as const) : undefined,
      className: clase(props.extra),
    };
    if (enlace) {
      return (
        <Link key={props.etiqueta ?? destino} href={enlace(destino)} aria-disabled={props.deshabilitada || undefined} tabIndex={props.deshabilitada ? -1 : undefined} {...comunes}>
          {contenido}
        </Link>
      );
    }
    return (
      <button key={props.etiqueta ?? destino} type="button" onClick={() => onPagina?.(destino)} disabled={props.deshabilitada} {...comunes}>
        {contenido}
      </button>
    );
  };

  return (
    <nav
      ref={nav}
      aria-label="Paginación"
      className={`paginas ${grande ? "paginas-grande" : ""}`}
      data-pista={pista ? "" : undefined}
      data-quieta={quieta ? "" : undefined}
    >
      {pista && <span aria-hidden className="paginas-pista" style={{ translate: `${pista.x}px 0`, width: pista.w }} />}
      {ir(pagina - 1, <ChevronLeft aria-hidden />, { etiqueta: "Página anterior", deshabilitada: pagina === 1, extra: "atras" })}
      {numerosDePagina(totalPaginas, pagina).map((n, i) =>
        n === null ? (
          <span key={`corte-${i}`} aria-hidden className="paginas-corte">
            …
          </span>
        ) : (
          ir(n, n, { actual: n === pagina, etiqueta: undefined })
        )
      )}
      {ir(pagina + 1, <ChevronRight aria-hidden />, { etiqueta: "Página siguiente", deshabilitada: pagina === totalPaginas, extra: "adelante" })}
    </nav>
  );
}
