import type { ReactNode } from "react";

/* ====================================================================
   BarraFija · resumen + acción, pegada al borde inferior (2026-09-18, ADR-0111)

   La usaba `RecepcionCompraFormV2` (unidades que se van a recibir + botón
   «Recibir») y la necesitan «Pagar juntos» (total de lo seleccionado) y la
   versión celular de Recibir. Una sola pieza para que se vea y se comporte
   igual: pegada al fondo en celular (desde 2026-09-25 ya no hay pestañas
   de navegación abajo: el menú es un cajón lateral), en escritorio a la
   derecha del lateral (`sm:left-lateral`).

   Quien la usa debe dejar aire abajo en su página (`pb-28 sm:pb-24`) para
   que no tape la última fila.

   En el celular es la Isla clara (ADR-0479, actividad 12; /unificar familia `barra-movil`): flota a 12 px
   de los bordes, como toda barra de abajo. Desde `sm` sigue siendo el vidrio de borde a borde de siempre: sus
   utilidades `sm:` le ganan a la pieza `barra-abajo`.
   ==================================================================== */

/** El vidrio de borde a borde, desde `sm` (en el celular manda la isla). */
const ESCRITORIO =
  "sm:inset-x-0 sm:bottom-0 sm:left-lateral sm:overflow-visible sm:rounded-none sm:border-x-0 sm:border-b-0 sm:border-t sm:bg-crema/95 sm:pb-[env(safe-area-inset-bottom)] sm:pr-[env(safe-area-inset-right)] sm:shadow-none sm:backdrop-blur sm:animate-none sm:supports-[backdrop-filter]:bg-crema/80";

export function BarraFija({
  resumen,
  acciones,
  medidor,
  aviso,
  className = "",
  visible,
  resumenMinimo,
  guia,
}: {
  /** Ancla de la guía (ADR-0389). */
  guia?: string;
  resumen: ReactNode;
  acciones: ReactNode;
  /** Una franja de 3 px pegada al borde superior (Recibir: contado · faltante · sin contar). */
  medidor?: ReactNode;
  /** Una línea de aviso ARRIBA de las cifras (Recibir: lo que impide recibir). Vacía = no ocupa lugar. */
  aviso?: ReactNode;
  className?: string;
  /** Sin esta prop la barra está siempre puesta (Recibir la monta solo cuando hace falta). Con ella, la barra SUBE al aparecer (420 ms) y BAJA al irse (240 ms, más corto: es un panel que se va) en vez de aparecer y desaparecer de un corte; sigue montada, inerte y oculta a los lectores de pantalla mientras está abajo (Por pagar, 2026-09-19). */
  visible?: boolean;
  /** Piso de ancho del resumen, como clase de Tailwind (`min-w-[17rem]`). Por defecto el resumen puede encogerse hasta 0 (`min-w-0`) y,
   *  en una barra angosta (una tablet con el lateral abierto), se aplasta contra los botones antes de que estos bajen a su propia línea;
   *  con un piso, cuando no caben juntos los botones bajan (2026-09-28, «Tienes N cambios sin guardar»). */
  resumenMinimo?: string;
}) {
  const animada = visible !== undefined;
  return (
    <div
      data-guia={guia}
      aria-hidden={animada && !visible ? true : undefined}
      inert={animada && !visible ? true : undefined}
      // `left` NO se anima al plegar el menú (ADR-0130, 2026-10-10): salta a su lugar junto con el contenido, que
      // tampoco se anima — ver la nota v3.6 de `AppShell`. Animarlo recalculaba la pantalla en cada cuadro.
      // Escondida baja su alto más el aire de la isla y la barrita del iPhone, para que no asome su borde.
      className={`barra-abajo z-20 block overflow-hidden p-0 ${ESCRITORIO} ${
        animada
          ? `${visible ? "translate-y-0 transition-transform duration-[420ms] ease-cayla" : "pointer-events-none translate-y-[calc(100%+3rem+env(safe-area-inset-bottom))] transition-transform duration-[240ms] ease-salida"}`
          : ""
      } ${className}`}
    >
      {medidor}
      {aviso ? <div className="px-4 pt-2 text-xs empty:hidden sm:px-10">{aviso}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-10">
        <div className={`${resumenMinimo ?? "min-w-0"} text-sm text-tinta/75 ${animada ? "basis-full sm:basis-0 sm:flex-1" : ""}`}>{resumen}</div>
        {/* Recibir (sin `visible`): el botón ocupa todo el ancho en celular; Por pagar (con `visible`): reparte sus acciones en la fila. */}
        <div className={`flex shrink-0 items-center gap-3 ${animada ? "max-sm:w-full max-sm:justify-between" : "w-full sm:w-auto"}`}>{acciones}</div>
      </div>
    </div>
  );
}
