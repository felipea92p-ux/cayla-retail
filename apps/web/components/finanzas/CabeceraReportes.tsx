import type { ReactNode } from "react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// El título de cada estado, bajo las cuatro respuestas (ADR-0585). Desde que «Reportes» pasó a ser «Estados financieros», la cabecera de
// la pantalla es una sola (`CabeceraEstados`: la cabecera única con las cuatro respuestas, que son las pestañas) y aquí queda lo de cada
// estado: su título de sección («Resultados de agosto», «¿Alcanza para pagar?»), su frase y sus herramientas (el mes, la sede, descargar).
// Presupuesto, Campañas y Escenarios ya no son pestañas: son páginas internas con su vuelta, y usan esto mismo bajo su cabecera.

export function CabeceraReportes({
  titulo,
  bajada,
  acciones,
  children,
}: {
  /** Cada estado dice su título («Resultados de agosto», «¿Alcanza para pagar?»). */
  titulo: ReactNode;
  bajada?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="min-w-0 max-w-[40rem] grow basis-[22rem]">
        <TituloSeccion>{titulo}</TituloSeccion>
        {bajada && <p className="mt-1 text-[15px] leading-relaxed text-taupe">{bajada}</p>}
        {children}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2.5">{acciones}</div>}
    </div>
  );
}
