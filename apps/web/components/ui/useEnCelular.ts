"use client";

import { useSyncExternalStore } from "react";

/** El ancho del celular: bajo 640 px (el `sm` de Tailwind) la hoja sube desde abajo (ADR-0479). */
export const CELULAR = "(max-width: 639.98px)";

/** El resto: desde 640 px. Lo que solo vale con la hoja quieta y anclada arriba (el vidrio que dobla de una hoja, ADR-0681). */
export const ESCRITORIO = "(min-width: 640px)";

/** ¿La pantalla es de celular ahora? Sigue al cambio (girar el teléfono, achicar la ventana). En el servidor, no. */
export function useEnCelular(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(CELULAR);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(CELULAR).matches,
    () => false,
  );
}
