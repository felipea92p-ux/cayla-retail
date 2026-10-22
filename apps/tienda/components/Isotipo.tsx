import { COLIBRI } from "@cayla-retail/shared/marca";
import { PiezaDeLaMarca } from "./Marca";

/** El colibrí del logo oficial (ADR-0446). Cada lugar le da su ancho y su color con CSS (`currentColor`); el alto sigue solo. */
export function Isotipo({ className = "" }: { className?: string }) {
  return <PiezaDeLaMarca pieza={COLIBRI} className={`t-marca t-marca-colibri ${className}`.trim()} />;
}
