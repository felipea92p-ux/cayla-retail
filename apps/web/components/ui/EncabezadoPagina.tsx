import type { CSSProperties, ReactNode } from "react";
import { FechaHoraLima } from "@/components/ui/FechaHoraLima";

/** La cabecera de Cambios, Devoluciones y Caja (Atelier, 2026-09-19), y desde el 2026-09-26 también la
 *  de Inventario (ADR-0220): arriba, dónde y cuándo —la sede que se mira y la hora de Lima, viva—, con
 *  el hilo de CAYLA (taupe) trazándose a su lado; después el título en la serif de la casa y su frase.
 *  A la derecha va UNA cosa: lo que acompañe (el resumen de la sede, el reloj de Caja) o, si la pantalla
 *  no trae nada de eso, sus acciones. El título es de 46 px: más presencia que el 30 de las demás
 *  pantallas, pero sin gritar sobre el menú lateral.
 *
 *  El título es el nombre de la pantalla tal como lo dice el menú («Existencias», «Caja»): la sede
 *  va arriba, nunca de título. Título y frase aceptan más que texto para los detalles (Traslado 12
 *  con su insignia; «Trujillo → Lima» con la flecha en taupe). */
export function EncabezadoPagina({
  sede,
  titulo,
  subtitulo,
  sinHora = false,
  detalle,
  acciones,
  pie,
  children,
}: {
  sede: string;
  titulo: ReactNode;
  subtitulo: ReactNode;
  /** La línea de arriba dice solo el día: la pantalla trae su propio reloj (Caja). */
  sinHora?: boolean;
  /** Algo más que decir en la línea de arriba, tras la hora (Facturación: desde cuándo está lo que se ve). */
  detalle?: ReactNode;
  /** Lo que se hace desde la pantalla, la principal al final (Existencias: bajar al piso y nuevo traslado).
   *  Van a la derecha, en el espacio libre; si la derecha ya es de las cifras o del reloj (`children`), bajan
   *  bajo la frase, como en Caja. Lo decide esta cabecera, no cada pantalla (ADR-0220, actualización). */
  acciones?: ReactNode;
  /** Bajo la frase, a la izquierda: la vuelta a la pantalla de arriba («← Traslados») o un estado que no es
   *  una acción (el resultado de un conteo). */
  pie?: ReactNode;
  /** A la derecha: las cifras de la sede (`ResumenSede`) o el reloj de Caja. */
  children?: ReactNode;
}) {
  const derechaOcupada = Boolean(children);
  const bajoLaFrase = derechaOcupada && acciones ? <>{pie}{acciones}</> : pie;
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
      <div className="anim-sube min-w-0">
        <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-taupe-profundo">
          <span aria-hidden className="hilo-dibuja block h-px w-8 shrink-0 bg-taupe" />
          <span className="min-w-0">
            {sede} · <FechaHoraLima sinHora={sinHora} />
            {detalle && <> · {detalle}</>}
          </span>
        </p>
        <h1 className="font-display mt-3 text-4xl leading-none tracking-tight text-tinta sm:text-[46px]">{titulo}</h1>
        <p className="mt-2.5 max-w-md text-[15px] text-tinta/70">{subtitulo}</p>
        {bajoLaFrase && <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2.5">{bajoLaFrase}</div>}
      </div>
      {derechaOcupada
        ? children
        : acciones && (
            // Entra un paso después del título, como el resumen de la sede. En el celular la fila se parte y
            // las acciones quedan bajo la frase, a la izquierda, donde estaban antes.
            <div className="anim-sube flex flex-wrap items-center gap-x-3 gap-y-2.5" style={{ "--i": 1 } as CSSProperties}>
              {acciones}
            </div>
          )}
    </header>
  );
}
