import type { CSSProperties } from "react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// El lugar de un bloque del Resumen mientras su lectura viaja (Resumen por bloques, ADR-0661). Es la misma tarjeta de vidrio que va a llegar, con su
// título y unas bandas, y con el alto de lo que suele traer (`alto`): así, cuando el bloque llega, toma su lugar sin empujar a los demás (nada salta).
// Sigue a `MovimientosEsperando` (la primera de esta pantalla): título en `TituloSeccion` y bandas que respiran (la respiración se apaga con el
// botón «Animaciones» y con `prefers-reduced-motion`, como la de `EsqueletoPantalla`). No es el loader: la pantalla ya se puede leer y usar.

/** Anchos fijos (no al azar: el servidor y el navegador tienen que dibujar lo mismo). */
const ANCHOS = [62, 88, 74, 81, 56, 93, 70];

export function EsperaBloque({ titulo, alto, bandas = 3, className = "" }: { titulo: string; alto: number; bandas?: number; className?: string }) {
  return (
    <section
      className={`fin-superficie fin-pad resumen-espera ${className}`.trim()}
      style={{ ["--alto-espera" as string]: `${alto}px` } as CSSProperties}
      aria-busy="true"
      aria-label={`${titulo}, cargando`}
    >
      <TituloSeccion>{titulo}</TituloSeccion>
      <div aria-hidden className="resumen-espera-bandas">
        {Array.from({ length: bandas }, (_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-tinta/10" style={{ width: `${ANCHOS[i % ANCHOS.length]}%` }} />
        ))}
      </div>
    </section>
  );
}
