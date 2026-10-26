import type { CSSProperties } from "react";
import type { ColorDeSede } from "@/lib/tienda-web-reglas";

/**
 * La fachada de una tienda (maqueta de Conf. Tienda, ADR-0518): un toldo de rayas del color de su sede sobre una puerta. Es dibujo, no foto:
 * cuando la tienda sube la suya (`fotoUrl`), la foto la reemplaza. El color es el hilo de sede (`--color-sede-*`), dato y no marca.
 */
export function Fachada({ color, fotoUrl, className = "" }: { color: ColorDeSede; /** La foto que subió la tienda; sin ella, el dibujo. */ fotoUrl?: string | null; className?: string }) {
  return (
    <div aria-hidden className={`twc-fachada ${className}`} style={{ "--c": `var(--color-sede-${color})` } as CSSProperties}>
      {fotoUrl ? (
        // La foto ya viene reducida por el ERP (WebP de 200 KB o menos) y se sirve desde el almacén público: no pasa por el optimizador.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <>
          <span className="twc-toldo" />
          <span className="twc-puertita" />
        </>
      )}
    </div>
  );
}
