import type { CSSProperties } from "react";

/* ====================================================================
   La barra de avance — una sola pieza (ADR-0358, ronda 13, Felipe eligió P1 el 2026-10-15)

   Cuánto va de algo contra su total o su meta: lo vendido contra la meta, lo contado de un envío, lo pagado de una factura.
   · La pista en arena y el relleno en TINTA, que pasa a VERDE solo al completarse. Lo que está mal (te pasas, se venció, falta un
     mínimo) lo dice la pantalla con `tono` («rojo», «ambar»): la barra no decide qué es malo.
   · Tres altos con nombre: `fina` (3 px, dentro de una fila de una lista), `normal` (6 px, la de fábrica) y `gruesa` (12 px, la cifra
     principal de una pantalla, como la meta de hoy en Caja).
   · `marca`: la rayita de «a esta hora tocaba» o de un mínimo (0–100; una o varias).
   · Se llena desde cero una vez al verse y, si la cifra cambia, se desliza (app/estilos/avance-anillo-copiar.css). Sin JavaScript: sirve
     en un Server Component. En una lista, `indice` desfasa la entrada de cada fila.
   · Siempre le dice su avance al lector (`etiqueta`), salvo `decorativa`: cuando el texto de al lado ya dice lo mismo.
   Registro: docs/unificar/grafico.avance.md. Nunca una pista con su relleno dibujada a mano.
   ==================================================================== */

export type AltoAvance = "fina" | "normal" | "gruesa";
export type TonoBarraAvance = "tinta" | "verde" | "ambar" | "rojo";

const acotar = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

export function BarraAvance({
  pct,
  alto = "normal",
  tono,
  marca,
  etiqueta,
  texto,
  decorativa = false,
  indice,
  title,
  className = "",
}: {
  /** Cuánto va, de 0 a 100. Pasado de 100 la barra se queda llena: el número de al lado es el que dice cuánto. */
  pct: number;
  alto?: AltoAvance;
  /** Sin tono: tinta, y verde al llegar a 100. Con tono, el que pide la pantalla. */
  tono?: TonoBarraAvance;
  /** La rayita de «a esta hora tocaba» (o de un mínimo), de 0 a 100. */
  marca?: number | readonly number[] | null;
  /** Lo que le dice al lector de pantalla («Lo contado del envío»). */
  etiqueta?: string;
  /** El avance en palabras para el lector («18 de 24»), si el porcentaje solo no lo dice. */
  texto?: string;
  /** El texto de al lado ya dice lo mismo: la barra se oculta al lector. */
  decorativa?: boolean;
  /** Posición en una lista: desfasa la entrada (38 ms por fila). */
  indice?: number;
  title?: string;
  className?: string;
}) {
  const p = acotar(pct);
  const color = tono ?? (pct >= 100 ? "verde" : "tinta");
  const marcas = marca == null ? [] : typeof marca === "number" ? [marca] : marca;
  const estilo = { "--p": `${p}%`, ...(indice !== undefined ? { "--i": indice } : {}) } as CSSProperties;
  const lector = decorativa
    ? ({ "aria-hidden": true } as const)
    : ({ role: "progressbar", "aria-valuenow": Math.round(p), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": etiqueta, "aria-valuetext": texto } as const);
  return (
    <span data-alto={alto} data-tono={color} title={title} className={`barra-avance ${className}`} style={estilo} {...lector}>
      <span className="barra-avance-lleno" />
      {marcas.map((m, i) => (
        <span key={i} aria-hidden className="barra-avance-marca" style={{ "--m": `${acotar(m)}%` } as CSSProperties} />
      ))}
    </span>
  );
}
