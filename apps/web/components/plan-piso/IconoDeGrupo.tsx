import type { CSSProperties } from "react";
import { MAX_COLORES_DEL_ICONO } from "@/lib/plan-piso-colores";
import { siluetaDe } from "@/lib/plan-piso-siluetas";

// El ícono de un grupo del plan del piso: su silueta sobre el color de su grupo. Necesita que `<SiluetasDelPlan />` esté en la pantalla (dibuja los símbolos una vez)
// y que quien lo rodea ponga el color con `estiloDeGrupo(indice)`. Sin hooks: sirve en servidor y en cliente.

/** El color de un grupo: sale de su posición en la lista del riel (con más de seis grupos los colores se repiten). Una sola fuente en `plan-piso.css`. */
export const estiloDeGrupo = (indice: number): CSSProperties => ({ ["--pp-c" as string]: `var(--grupo-${((indice % 6) + 6) % 6})` });

/** Lo que se corre cada prenda de la anterior en el ícono de colores, en unidades de la silueta (que mide 40 de ancho y 60 de alto). */
const SALTO = 11;
/** Lo que mide la silueta de ancho, de borde a borde (de 4,5 a 35,5 en la más ancha). */
const ANCHO_DE_LA_SILUETA = 32;

/**
 * `colores`: en las fichas de «Hoy» y las tarjetas de «Cómo quedaría» el ícono muestra los colores principales de su grupo (ADR-0352 act. 2026-10-11 (c)): hasta tres
 * prendas pequeñas, una por color, superpuestas como las perchas del riel (la del color que más cuelga va al frente). Sin colores, la silueta del color del grupo.
 * El ancho del ícono con colores es siempre el de tres prendas, centrado: así las fichas no cambian de ancho —y los títulos no se desalinean— de un grupo a otro.
 * El color de las prendas es dato, no tema (`data-color-dato`).
 */
export function IconoDeGrupo({ clave, className = "", colores }: { clave: string; className?: string; colores?: readonly string[] }) {
  const hexes = (colores ?? []).slice(0, MAX_COLORES_DEL_ICONO);
  if (hexes.length === 0) {
    return (
      <svg className={`pp-ic ${className}`.trim()} viewBox="2 15 36 43" aria-hidden="true" focusable="false">
        <use href={`#pp-s-${siluetaDe(clave)}`} className="pp-sil" />
      </svg>
    );
  }
  const ancho = ANCHO_DE_LA_SILUETA + (MAX_COLORES_DEL_ICONO - 1) * SALTO;
  const contenido = ANCHO_DE_LA_SILUETA + (hexes.length - 1) * SALTO;
  const desde = 4 - (ancho - contenido) / 2;
  return (
    <svg className={`pp-ic pp-ic-colores ${className}`.trim()} viewBox={`${desde} 15 ${ancho} 43`} aria-hidden="true" focusable="false" data-color-dato="">
      {/* De atrás hacia adelante: la última se dibuja primero y la del color principal queda encima de las demás. */}
      {hexes
        .map((hex, i) => ({ hex, i }))
        .reverse()
        .map(({ hex, i }) => (
          <use key={`${hex}-${i}`} href={`#pp-s-${siluetaDe(clave)}`} x={i * SALTO} y={0} width={40} height={60} className="pp-sil" style={{ ["--pp-c" as string]: hex } as CSSProperties} />
        ))}
    </svg>
  );
}
