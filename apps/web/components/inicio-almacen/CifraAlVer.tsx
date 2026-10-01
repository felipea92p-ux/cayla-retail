"use client";

import { useContar } from "@/lib/useContar";
import { useAlVerse } from "./useAlVerse";

/** Un número que cuenta desde 0 hasta su valor la primera vez que se ve (no cuando la página carga, si está más abajo).
 *  El texto para lectores de pantalla es siempre el valor final: nunca un 0 a medias. */
export function CifraAlVer({ valor }: { valor: number }) {
  const [ref, visto] = useAlVerse<HTMLSpanElement>(0.3);
  const mostrado = useContar(visto ? valor : 0, 900);
  return (
    <span ref={ref} aria-label={valor.toLocaleString("es-PE")}>
      <span aria-hidden>{Math.round(mostrado).toLocaleString("es-PE")}</span>
    </span>
  );
}
