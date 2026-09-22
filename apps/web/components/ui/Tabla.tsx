import type { CSSProperties, ReactNode } from "react";

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
  /** Solo desde xl (1280): la columna que a menos ancho se apila dentro de otra celda (la fila
   *  debe ocultar su celda propia con `hidden xl:block` y mostrar el contenido en la otra con
   *  `xl:hidden`). */
  desdeXl?: boolean;
  /** Segunda línea del encabezado, en minúscula y más tenue («en 30 d», «A → B»): la unidad o el
   *  contexto de la cifra. Es contenido, no adorno. */
  subtitulo?: string;
  /** Texto que explica la columna al pasar el mouse (`title`). */
  ayuda?: string;
};

const ALINEAR: Record<Alineacion, string> = { izq: "text-left", der: "text-right", centro: "text-center" };

/** Las clases de toda tabla de Inventario (2026-09-21; la referencia de estilo es Existencias). Una sola
 *  fuente: `Tabla`, `Encabezado` y `fila` las usan, y las tablas que arman su propia rejilla (Traslados, las
 *  de Análisis) las importan en vez de copiarlas — así un cambio de padding o de tono llega a todas a la vez. */
export const TABLA = {
  contenedor: "card-cayla divide-y divide-tinta/10 overflow-x-auto",
  encabezado: "gap-x-4 px-5 py-2",
  titulo: "label-cayla text-[11px] text-tinta/55",
  fila: "gap-x-4 gap-y-1 px-5 py-3",
  /** El renglón de pie (cuántas se muestran, exportar, paginar). */
  pie: "px-5 py-2.5 text-xs text-tinta/55",
  /** Sin resultados: una tarjeta aparte, o dentro de la tarjeta de la sección con `border-t`. */
  vacio: "p-5 text-sm text-tinta/75",
} as const;

// `overflow-x-auto`: encontrado el 2026-09-15 al centrar Inventario — con
// columnas fijas angostas (rem) + una sola `1fr`, una ventana más angosta
// que la suma de las fijas deja a la columna flexible en 0px, invisible,
// en vez de desbordar. Con `overflow-x-auto` acá (una vez, para las tres
// tablas que usan este componente) la fila se desborda hacia un scroll
// horizontal de la tarjeta — nunca una columna que desaparece sin avisar.
export function Tabla({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`${TABLA.contenedor} ${className}`} style={style}>
      {children}
    </div>
  );
}

/** La fila de títulos. `plantilla` debe ser la misma que reciben las filas.
 *  `siempre`: para las tablas anchas que se desplazan dentro de su tarjeta en vez de apilarse en celular
 *  (las de Análisis): el encabezado no se esconde bajo `sm` y los títulos de una y de dos líneas se
 *  alinean por abajo. */
export function Encabezado({ columnas, plantilla, siempre = false }: { columnas: Columna[]; plantilla: string; siempre?: boolean }) {
  return (
    <div className={`${siempre ? "grid items-end" : "hidden sm:grid"} ${TABLA.encabezado} ${plantilla}`} role="row">
      {columnas.map((c, i) => (
        <span
          key={i}
          title={c.ayuda}
          className={`${TABLA.titulo} ${siempre ? "block min-w-0" : ""} ${ALINEAR[c.alinear ?? "izq"]} ${c.desdeLg ? "hidden lg:block" : ""} ${c.desdeXl ? "hidden xl:block" : ""}`}
          role="columnheader"
        >
          {c.titulo}
          {c.subtitulo && <span className="block truncate text-[10px] normal-case tracking-normal text-tinta/45">{c.subtitulo}</span>}
        </span>
      ))}
    </div>
  );
}

/** Clases para una fila de datos con la misma plantilla que el encabezado. */
export function fila(plantilla: string, extra = ""): string {
  return `grid ${TABLA.fila} sm:items-baseline ${plantilla} ${extra}`;
}

/** Clases para una celda: alineación en escritorio; en celular todo va a la izquierda.
    Las celdas a la derecha son cifras: no envuelven nunca (una cifra partida
    en dos líneas se lee como dos cifras). El ancho lo fija la plantilla, no
    el contenido — por eso ninguna plantilla usa `auto`: con `auto` cada fila
    calcularía su propio ancho y las columnas se descuadran entre filas. */
export function celda(alinear: Alineacion = "izq", extra = ""): string {
  return `min-w-0 ${alinear === "der" ? "sm:text-right whitespace-nowrap tabular-nums" : alinear === "centro" ? "sm:text-center truncate" : "truncate"} ${extra}`;
}
