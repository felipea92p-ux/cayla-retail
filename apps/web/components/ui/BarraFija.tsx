import type { ReactNode } from "react";

/* ====================================================================
   BarraFija · resumen + acción, pegada al borde inferior (2026-09-18, ADR-0111)

   La usaba `RecepcionCompraFormV2` (unidades que se van a recibir + botón
   «Recibir») y la necesitan «Pagar juntos» (total de lo seleccionado) y la
   versión celular de Recibir. Una sola pieza para que se vea y se comporte
   igual: en celular queda POR ENCIMA de las pestañas de navegación
   (`bottom-[calc(4.25rem+…)]`), en escritorio pegada al fondo y a la
   derecha del lateral (`sm:left-lateral`).

   Quien la usa debe dejar aire abajo en su página (`pb-28 sm:pb-24`) para
   que no tape la última fila.
   ==================================================================== */

export function BarraFija({
  resumen,
  acciones,
  medidor,
  aviso,
  className = "",
  visible,
}: {
  resumen: ReactNode;
  acciones: ReactNode;
  /** Una franja de 3 px pegada al borde superior (Recibir: contado · faltante · sin contar). */
  medidor?: ReactNode;
  /** Una línea de aviso ARRIBA de las cifras (Recibir: lo que impide recibir). Vacía = no ocupa lugar. */
  aviso?: ReactNode;
  className?: string;
  /** Sin esta prop la barra está siempre puesta (Recibir la monta solo cuando hace falta). Con ella, la barra SUBE al aparecer (420 ms) y BAJA al irse (240 ms, más corto: es un panel que se va) en vez de aparecer y desaparecer de un corte; sigue montada, inerte y oculta a los lectores de pantalla mientras está abajo (Por pagar, 2026-09-19). */
  visible?: boolean;
}) {
  const animada = visible !== undefined;
  return (
    <div
      aria-hidden={animada && !visible ? true : undefined}
      inert={animada && !visible ? true : undefined}
      // `left` también se anima (menú lateral plegable, ADR-0130): sin `sm:transition-[left]` la barra
      // saltaría al plegar mientras el contenido se desliza. Con `animada` comparte la transición del
      // `transform` (`sm:transition-[left,transform]`): dos utilidades `transition-*` no se suman solas.
      className={`fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t border-sand bg-crema/95 backdrop-blur supports-[backdrop-filter]:bg-crema/80 sm:bottom-0 sm:left-lateral ${
        animada
          ? `sm:transition-[left,transform] ${visible ? "translate-y-0 transition-transform duration-[420ms] ease-cayla" : "pointer-events-none translate-y-[110%] transition-transform duration-[240ms] ease-salida"}`
          : "sm:transition-[left] sm:duration-300 sm:ease-cayla"
      } ${className}`}
    >
      {medidor}
      {aviso ? <div className="px-4 pt-2 text-xs empty:hidden sm:px-10">{aviso}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-10">
        <div className={`min-w-0 text-sm text-tinta/75 ${animada ? "basis-full sm:basis-0 sm:flex-1" : ""}`}>{resumen}</div>
        {/* Recibir (sin `visible`): el botón ocupa todo el ancho en celular; Por pagar (con `visible`): reparte sus acciones en la fila. */}
        <div className={`flex shrink-0 items-center gap-3 ${animada ? "max-sm:w-full max-sm:justify-between" : "w-full sm:w-auto"}`}>{acciones}</div>
      </div>
    </div>
  );
}
