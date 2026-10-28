"use client";

import { useEffect, useSyncExternalStore } from "react";

// Cuántas prendas decía la bolsa de la cabecera la última vez (2026-10-17): el esqueleto de la bolsa dibuja esa cantidad de filas con su
// resumen, o la bolsa vacía con sus dos caminos, en vez de una lista cualquiera que al llegar se volvía otra cosa. En la memoria de esta
// pestaña; sin dato (recién abierta), null.
let ultima: number | null = null;
const sinAvisos = () => () => {};
const laUltima = () => ultima;
const ninguna = () => null;

/** La pone `BotonBolsa` (de servidor) junto al ícono: guarda la cuenta. No dibuja nada. */
export function RecordarBolsa({ cuantas }: { cuantas: number }) {
  useEffect(() => {
    ultima = cuantas;
  }, [cuantas]);
  return null;
}

/** Cuántas prendas tenía la bolsa la última vez que se vio la cabecera; null si no se sabe. */
export function useBolsaVista(): number | null {
  return useSyncExternalStore(sinAvisos, laUltima, ninguna);
}
