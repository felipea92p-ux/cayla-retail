import { fondoDeColor } from "../ui/MuestraColor";
import { fondoDeMezcla } from "../../lib/color-combinado";
import { bordeDeMuestra } from "../../lib/colores-familias";

// El puntito de color que va junto al nombre de un color (la fila de la tabla, la píldora de «elegido», la lista del buscador). Vivía en `ElegirColores.tsx`, que arrastra
// el modal de color nuevo y el buscador: la tabla de cantidades solo necesita el punto, y con imports relativos y sin "use client" se puede dibujar (y probar) sola.
// `ElegirColores` lo sigue exportando para quien ya lo importaba de allí.

// Una mezcla («Hueso con azul», ADR-0643) pasa `tonos` (de `tonosDeMezcla`): el punto se parte, con la base a la izquierda.
// `muestra` (40 px): el color que se mira de verdad —el pie de la carta, la mezcla que se arma—; Felipe 2026-11-12: «el círculo de color es muy pequeño».
export function Punto({ hex, familia, tipo, tonos, grande = false, muestra = false }: { hex: string | null; familia?: string | null; tipo?: string | null; tonos?: readonly string[] | null; grande?: boolean; muestra?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border border-tinta/20 ${muestra ? "h-10 w-10" : grande ? "h-5 w-5" : "h-2.5 w-2.5"}`}
      style={{ background: tonos && tonos.length >= 2 ? fondoDeMezcla(tonos) : fondoDeColor(hex, familia, tipo), borderColor: bordeDeMuestra(hex) }}
    />
  );
}
