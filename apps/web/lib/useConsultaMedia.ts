"use client";

import { useSyncExternalStore } from "react";

/** ¿Calza esta media query ahora? Se re-renderiza cuando cambia (girar el teléfono, cambiar el ancho). En el servidor
 *  responde `false` (escritorio): quien lo use debe pintar primero lo de escritorio sin romperse en celular. */
export function useConsultaMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
