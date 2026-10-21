import { bordeDeMuestra, fondoDeMuestra } from "../../lib/colores-familias";

// El puntito de color que va junto al nombre de un color (la fila de la tabla, la píldora de «elegido», la lista del buscador). Vivía en `ElegirColores.tsx`, que arrastra
// el modal de color nuevo y el buscador: la tabla de cantidades solo necesita el punto, y con imports relativos y sin "use client" se puede dibujar (y probar) sola.
// `ElegirColores` lo sigue exportando para quien ya lo importaba de allí.

export function Punto({ hex, familia, tipo, grande = false }: { hex: string | null; familia?: string | null; tipo?: string | null; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border border-tinta/20 ${grande ? "h-5 w-5" : "h-2.5 w-2.5"}`}
      style={{ background: fondoDeMuestra(hex, familia, tipo) ?? "transparent", borderColor: bordeDeMuestra(hex) }}
    />
  );
}
