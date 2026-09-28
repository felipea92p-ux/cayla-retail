"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** La pantalla en la que está la persona, con sus filtros y su vista (`/productos?vista=tabla&q=polo`). Sirve para que
 *  una pantalla a la que se sale (imprimir etiquetas) sepa devolverla exactamente al mismo lugar. */
export function usePantallaActual(): string {
  const ruta = usePathname();
  const q = useSearchParams().toString();
  return q ? `${ruta}?${q}` : ruta;
}
