import type { CSSProperties } from "react";
import type { ColorDeSede } from "@/lib/tienda-web-reglas";

/**
 * La fachada de una tienda (maqueta de Conf. Tienda, ADR-0518): un toldo de rayas del color de su sede sobre una puerta. Es dibujo, no foto:
 * cuando la tienda sube la suya, la foto la reemplaza. El color es el hilo de sede (`--color-sede-*`), dato y no marca.
 */
export function Fachada({ color, className = "" }: { color: ColorDeSede; className?: string }) {
  return (
    <div aria-hidden className={`twc-fachada ${className}`} style={{ "--c": `var(--color-sede-${color})` } as CSSProperties}>
      <span className="twc-toldo" />
      <span className="twc-puertita" />
    </div>
  );
}
