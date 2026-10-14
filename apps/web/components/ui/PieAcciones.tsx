import type { ReactNode } from "react";

/* ====================================================================
   El pie de una hoja (ADR-0358, ronda 11 de /unificar: Felipe lo eligió tocándolo el 2026-10-14).

   «Cancelar» es el botón secundario del sistema (`<Boton peso="fantasma">` o `btn-cayla btn-secundario`), del ancho de su palabra, y va
   ANTES del botón que guarda; los dos a la derecha. Lo que borra o desactiva va en `izquierda` (rojo desde el principio, ronda 7). En el
   celular los de la derecha se reparten la fila en mitades y lo de la izquierda baja a su propia fila. La regla vive en la clase
   `pie-acciones` (`app/estilos/pie-acciones.css`): un pie que ya es un <div> puede llevarla directo, con `pie-hoja-fijo` si la hoja es
   larga. Nunca un «Cancelar» a media fila en escritorio, sutil, en versalitas ni DESPUÉS de «Guardar».
   ==================================================================== */
export function PieAcciones({
  children,
  izquierda,
  className = "",
  guia,
}: {
  /** «Cancelar» y después el botón que guarda. */
  children: ReactNode;
  /** Lo que borra o desactiva, solo a la izquierda. */
  izquierda?: ReactNode;
  className?: string;
  /** Ancla de la guía (ADR-0389). */
  guia?: string;
}) {
  return (
    <div className={`pie-acciones ${className}`} data-guia={guia}>
      {izquierda ? <div className="pie-acciones-izq">{izquierda}</div> : null}
      {children}
    </div>
  );
}
