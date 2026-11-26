import type { ReactNode } from "react";

/* ====================================================================
   ParDato · un dato con su nombre (2026-11-26, Producción más clara)

   Por qué existe: en Producción los datos de una fila iban en una sola línea separados por un punto medio
   («stock 4 · 6/sem. · 12 en 30 d»): no se veía dónde terminaba uno y empezaba el otro ni qué era cada número.
   Felipe pidió otra forma de separar. Cada dato es su pieza: el nombre chico arriba y el valor abajo.

   `<Pares>` los pone en fila y los baja de línea si no caben. El tono lo pone el dato cuando dice algo
   (ámbar: pide atención; rojo: plata vencida o un error; verde: está bien), nunca por adorno.
   Maqueta: docs/maquetas/produccion-resumen-2026-11/.
   ==================================================================== */

export type TonoPar = "tinta" | "ambar" | "rojo" | "verde";

const TONO: Record<TonoPar, string> = {
  tinta: "text-tinta",
  ambar: "text-ambar",
  rojo: "text-rojo-profundo",
  verde: "text-verde",
};

export function ParDato({
  rotulo,
  children,
  tono = "tinta",
  grande = false,
  className = "",
}: {
  /** El nombre del dato, en palabras completas: «Quedan en tiendas», nunca «Stock». */
  rotulo: ReactNode;
  /** El valor: «30 m», «Hace 2 días», «Ninguno». */
  children: ReactNode;
  tono?: TonoPar;
  /** El valor a 18 px en vez de 16: para los datos de una cabecera o de un resumen. */
  grande?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-block min-w-0 align-top ${className}`}>
      <span className="block whitespace-nowrap text-xs leading-snug text-tenue">{rotulo}</span>
      <span className={`block whitespace-nowrap font-semibold leading-snug tabular-nums ${grande ? "text-lg" : "text-sm"} ${TONO[tono]}`}>{children}</span>
    </span>
  );
}

/** La fila de pares: se acomodan uno al lado del otro y bajan de línea si no caben. */
export function Pares({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`flex flex-wrap gap-x-6 gap-y-1.5 ${className}`}>{children}</span>;
}
