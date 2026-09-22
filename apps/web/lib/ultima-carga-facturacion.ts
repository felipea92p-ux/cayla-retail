"use client";

import { useSyncExternalStore } from "react";

// Cuándo llegó la vista que se está mirando, para decir «actualizado hace…» en la cabecera de
// Facturación. Cada página lo registra al montarse y cada vez que el servidor la vuelve a armar
// (`MarcaDeCarga`); la cabecera lo lee. Se mide con el reloj de QUIEN MIRA, desde que llegó: el
// reloj de una tablet de sede puede estar mal puesto y restarlo del del servidor daría edades
// absurdas. Una tienda de módulo y no un contexto: la cabecera y las páginas no comparten padre
// con estado (las páginas son hijas del shell y la cabecera es su hermana).
let ultima: number | null = null;
const oyentes = new Set<() => void>();

/** Registra que la vista acaba de llegar (`ms`: el reloj del navegador). */
export function marcarCarga(ms: number): void {
  ultima = ms;
  oyentes.forEach((avisar) => avisar());
}

/** El instante (ms, reloj del navegador) en que llegó la vista; `null` antes de la primera. */
export function useUltimaCarga(): number | null {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
    () => ultima,
    () => null
  );
}
