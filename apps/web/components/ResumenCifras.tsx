import type { ReactNode } from "react";
import type { Lectura, TonoLectura } from "@/lib/resumen-lectura";

// Las cuatro cifras de arriba del Análisis de inventario (rediseño 2026-09-22, guía oficial). Desde el 2026-10-06 se
// dibujan con la pieza única `TarjetaCifra` (ADR-0357, /unificar ronda 1): la `TarjetaCifraAnalisis` que vivía aquí era
// una copia de ella con delta, «A → B» y la ayuda solo en un `title` (con el dedo no aparecía nunca); todo eso lo tiene
// ahora la pieza (`detalleTono` para el delta, `antes`, `pie` y el (!) de `ayuda`). En Comparar la cifra es «A → B»:
// A chica y apagada, B grande, porque B es lo que se analiza y A es la referencia (A siempre antes que B).

export type TonoDelta = "alza" | "baja" | "neutro";

/** El color de la línea del cambio («2.ª mitad ↑ 18%»): verde-profundo si sube, ámbar-profundo si baja. Nunca rojo. */
export const TONO_DELTA: Record<TonoDelta, string> = { alza: "text-verde-profundo", baja: "text-ambar-profundo", neutro: "text-taupe" };

/** «↑ 18%» / «↓ 5%» / «sin cambio» / «N/D» y su tono: subir es bueno para ventas, rotación y sell-through. */
export function flechaPct(pct: number | null, sufijo = "%"): { texto: string; tono: TonoDelta } {
  if (pct === null) return { texto: "N/D", tono: "neutro" };
  const n = Math.round(pct);
  if (n === 0) return { texto: "sin cambio", tono: "neutro" };
  return { texto: `${n > 0 ? "↑" : "↓"} ${Math.abs(n)}${sufijo}`, tono: n > 0 ? "alza" : "baja" };
}

/** La fila de cuatro: dos por fila en tableta, una en el celular. */
export function FilaCifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">{children}</div>;
}

// La dona de ritmo usa los colores de GRÁFICO (`--color-grafico-*`, validados como relleno vecino): el verde y el
// ámbar oficiales son para texto y se confunden como relleno. Siempre van con flecha, etiqueta y número al lado.
export const COLOR_ALZA = "var(--color-grafico-alza)";
export const COLOR_NEUTRO = "var(--color-grafico-neutro)";
export const COLOR_BAJA = "var(--color-grafico-baja)";

/** Lleva la vista a la tabla de abajo (la dona y «Ver ranking» filtran u ordenan la tabla, no otra pantalla). */
export function irALaTabla(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
}

const TONO_LECTURA: Record<TonoLectura, { texto: string; punto: string }> = {
  rojo: { texto: "text-rojo-profundo", punto: "bg-rojo" },
  ambar: { texto: "text-ambar-profundo", punto: "bg-ambar" },
  verde: { texto: "text-verde-profundo", punto: "bg-verde" },
  neutro: { texto: "text-taupe", punto: "bg-taupe/40" },
};

/** La celda «Cambio relevante» / «Lectura del período»: una frase con un punto del color de su tono (el color
 *  nunca va solo: la frase dice lo mismo). El porqué con números va en el `title`. Sin lectura: «—». */
export function LecturaCelda({ lectura }: { lectura: Lectura | null }) {
  if (lectura === null)
    return (
      <span role="cell" className="min-w-0 text-sm text-tinta/35" title="No hay suficiente historial para leer esta variante">
        —
      </span>
    );
  const t = TONO_LECTURA[lectura.tono];
  return (
    <span role="cell" className={`flex min-w-0 items-start gap-2 text-[13px] leading-snug ${t.texto}`} title={lectura.detalle}>
      <span aria-hidden className={`mt-[0.4em] h-1.5 w-1.5 shrink-0 rounded-full ${t.punto}`} />
      <span className="min-w-0">{lectura.texto}</span>
    </span>
  );
}
