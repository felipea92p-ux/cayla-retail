import type { ReactNode } from "react";

/* ====================================================================
   BarraFija · resumen + acción, pegada al borde inferior (2026-09-18, ADR-0106)

   La usaba `RecepcionCompraFormV2` (unidades que se van a recibir + botón
   «Recibir») y la necesitan «Pagar juntos» (total de lo seleccionado) y la
   versión celular de Recibir. Una sola pieza para que se vea y se comporte
   igual: en celular queda POR ENCIMA de las pestañas de navegación
   (`bottom-[calc(4.25rem+…)]`), en escritorio pegada al fondo y a la
   derecha del lateral (`sm:left-lateral`).

   Quien la usa debe dejar aire abajo en su página (`pb-28 sm:pb-24`) para
   que no tape la última fila.
   ==================================================================== */

export function BarraFija({ resumen, acciones, className = "" }: { resumen: ReactNode; acciones: ReactNode; className?: string }) {
  return (
    <div
      className={`fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t border-sand bg-crema/95 backdrop-blur supports-[backdrop-filter]:bg-crema/80 sm:bottom-0 sm:left-lateral ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-10">
        <div className="min-w-0 text-sm text-tinta/75">{resumen}</div>
        <div className="flex shrink-0 items-center gap-3">{acciones}</div>
      </div>
    </div>
  );
}
