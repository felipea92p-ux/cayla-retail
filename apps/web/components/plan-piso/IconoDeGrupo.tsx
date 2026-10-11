import type { CSSProperties } from "react";
import { siluetaDe } from "@/lib/plan-piso-siluetas";

// El ícono de un grupo del plan del piso: su silueta sobre el color de su grupo. Necesita que `<SiluetasDelPlan />` esté en la pantalla (dibuja los símbolos una vez)
// y que quien lo rodea ponga el color con `estiloDeGrupo(indice)`. Sin hooks: sirve en servidor y en cliente.

/** El color de un grupo: sale de su posición en la lista del riel (con más de seis grupos los colores se repiten). Una sola fuente en `plan-piso.css`. */
export const estiloDeGrupo = (indice: number): CSSProperties => ({ ["--pp-c" as string]: `var(--grupo-${((indice % 6) + 6) % 6})` });

export function IconoDeGrupo({ clave, className = "" }: { clave: string; className?: string }) {
  return (
    <svg className={`pp-ic ${className}`.trim()} viewBox="2 15 36 43" aria-hidden="true" focusable="false">
      <use href={`#pp-s-${siluetaDe(clave)}`} className="pp-sil" />
    </svg>
  );
}
