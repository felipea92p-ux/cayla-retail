import type { ReactNode } from "react";

/* ====================================================================
   Tabla · listados con encabezado (2026-09-12, módulo de Compras)

   Por qué existe: las listas del sistema eran filas `flex` con anchos
   fijos por celda, sin fila de títulos — quien la miraba tenía que
   adivinar qué era cada número. Poner un encabezado "a ojo" repitiendo
   los anchos en otro `div` es garantía de que un día se desalineen.

   Acá la plantilla de columnas se declara UNA vez (`plantilla`, un
   `grid-template-columns` de Tailwind) y la usan tanto el encabezado
   como cada fila: si cambia una columna, cambia en los dos lugares a la
   vez. En celular (< sm) el encabezado se oculta y cada fila apila sus
   celdas — una tabla de 6 columnas no cabe en 400px, y la fila sigue
   leyéndose porque cada dato lleva su contexto.
   ==================================================================== */

type Alineacion = "izq" | "der" | "centro";

export type Columna = {
  titulo: ReactNode;
  alinear?: Alineacion;
  /** Solo desde sm: oculta en celular. */
  soloEscritorio?: boolean;
  /** Solo desde lg: para una columna prescindible cuando la plantilla `sm:` no
   *  la incluye (la fila debe ocultar esa celda con `hidden lg:block` también). */
  desdeLg?: boolean;
};

const ALINEAR: Record<Alineacion, string> = { izq: "text-left", der: "text-right", centro: "text-center" };

export function Tabla({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-cayla divide-y divide-tinta/10 ${className}`}>{children}</div>;
}

/** La fila de títulos. `plantilla` debe ser la misma que reciben las filas. */
export function Encabezado({ columnas, plantilla }: { columnas: Columna[]; plantilla: string }) {
  return (
    <div className={`hidden gap-x-4 px-5 py-2 sm:grid ${plantilla}`} role="row">
      {columnas.map((c, i) => (
        <span key={i} className={`label-cayla text-[11px] text-tinta/55 ${ALINEAR[c.alinear ?? "izq"]} ${c.desdeLg ? "hidden lg:block" : ""}`} role="columnheader">
          {c.titulo}
        </span>
      ))}
    </div>
  );
}

/** Clases para una fila de datos con la misma plantilla que el encabezado. */
export function fila(plantilla: string, extra = ""): string {
  return `grid gap-x-4 gap-y-1 px-5 py-3 sm:items-baseline ${plantilla} ${extra}`;
}

/** Clases para una celda: alineación en escritorio; en celular todo va a la izquierda.
    Las celdas a la derecha son cifras: no envuelven nunca (una cifra partida
    en dos líneas se lee como dos cifras). El ancho lo fija la plantilla, no
    el contenido — por eso ninguna plantilla usa `auto`: con `auto` cada fila
    calcularía su propio ancho y las columnas se descuadran entre filas. */
export function celda(alinear: Alineacion = "izq", extra = ""): string {
  return `min-w-0 ${alinear === "der" ? "sm:text-right whitespace-nowrap tabular-nums" : alinear === "centro" ? "sm:text-center" : "truncate"} ${extra}`;
}
