import { DIBUJOS_DE_INSIGNIA, type ColorDeInsignia, type DibujoDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { pintarDibujo } from "@/components/MuestraEtiqueta";

// El dibujo de una insignia dentro de un control (el selector de dibujos, ADR-0490): trazo y relleno del color del texto (`currentColor`) y
// lo «recortado» —la cara de la calabaza— del color de la superficie que lo rodea (`--color-papel`), así se ve igual en claro y en oscuro.
// Solo tokens: nunca un color suelto. El dibujo de una tarjeta o de un sello de tinta tiene su propio marco (`MuestraEtiqueta`, `SelloTinta`).
const COLORES: Record<ColorDeInsignia, string> = { $acento: "currentColor", $hueco: "var(--color-papel)", $tinta: "currentColor" };

export function DibujoInsignia({ clave, className = "h-6 w-6" }: { clave: DibujoDeInsignia; className?: string }) {
  return (
    // Un poco más allá de ±14: el gato y la llama de la vela se asoman hasta 15.
    <svg className={className} viewBox="-15.5 -15.5 31 31" aria-hidden="true" focusable="false">
      {pintarDibujo(DIBUJOS_DE_INSIGNIA[clave], COLORES)}
    </svg>
  );
}
