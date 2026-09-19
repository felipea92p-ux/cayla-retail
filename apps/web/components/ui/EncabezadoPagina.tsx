import type { ReactNode } from "react";
import { FechaHoraLima } from "@/components/ui/FechaHoraLima";

/** La cabecera de Cambios, Devoluciones y Caja (Atelier, 2026-09-19): arriba, dónde y cuándo
 *  —la sede que se mira y la hora de Lima, viva—, con el hilo de CAYLA (taupe) trazándose a
 *  su lado; después el título en la serif de la casa y su frase. A la derecha, lo que
 *  acompañe (el resumen de la sede). El título es de 46 px: más presencia que el 30 de las
 *  demás pantallas, pero sin gritar sobre el menú lateral. */
export function EncabezadoPagina({
  sede,
  titulo,
  subtitulo,
  sinHora = false,
  pie,
  children,
}: {
  sede: string;
  titulo: string;
  subtitulo: string;
  /** La línea de arriba dice solo el día: la pantalla trae su propio reloj (Caja). */
  sinHora?: boolean;
  /** Bajo la frase, a la izquierda: las acciones de la pantalla (Caja: ingreso/egreso y cerrar). */
  pie?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
      <div className="anim-sube min-w-0">
        <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-profundo">
          <span aria-hidden className="hilo-dibuja block h-px w-8 shrink-0 bg-taupe" />
          <span className="min-w-0">
            {sede} · <FechaHoraLima sinHora={sinHora} />
          </span>
        </p>
        <h1 className="font-display mt-3 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">{titulo}</h1>
        <p className="mt-2.5 max-w-md text-[15px] text-tinta/70">{subtitulo}</p>
        {pie && <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2.5">{pie}</div>}
      </div>
      {children}
    </header>
  );
}
