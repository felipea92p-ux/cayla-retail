import type { CSSProperties } from "react";

/**
 * La imagen propia de una insignia dentro de un control del ERP (ADR-0490): a todo color, como se subió, o —con `silueta`— usada solo por su forma y
 * pintada con el color del texto del lugar (`currentColor`), así cambia con el modo claro y oscuro igual que los dibujos de la lista. Decorativa:
 * el nombre de la insignia ya está al lado. El sello de tinta y las tarjetas la dibujan dentro de su propio SVG (`MuestraEtiqueta.dibujoDeEtiqueta`).
 */
export function ImagenDeInsignia({ url, silueta = false, className = "h-7 w-7" }: { url: string; silueta?: boolean; className?: string }) {
  if (silueta) {
    // La dirección sale de nuestro propio armado (`urlDeImagenDeInsignia`) o es una vista previa local (`blob:`): se escapan las comillas por si acaso.
    const estilo = { "--silueta-url": `url("${url.replace(/"/g, "%22")}")` } as CSSProperties;
    return <span aria-hidden className={`silueta-insignia ${className}`} style={estilo} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- una vista previa local (blob:) o del almacén público: no pasa por el optimizador
  return <img src={url} alt="" className={`${className} object-contain`} />;
}
