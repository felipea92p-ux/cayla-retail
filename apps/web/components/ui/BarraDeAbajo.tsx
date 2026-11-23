"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { CELULAR } from "@/components/ui/useEnCelular";
import { useVidrioQueDobla } from "@/components/ui/useVidrioQueDobla";

/**
 * La barra de abajo: la Isla (ADR-0479, actividad 12; /unificar familia `barra-movil`, Felipe la eligió mirando el 2026-10-23). Flota a
 * 12 px de los bordes con esquinas de 18 px; clara para lo que toca hacer en la pantalla, oscura (`tono="tinta"`) para lo que llevas
 * elegido. Con una sola acción, `sola`: la isla es el botón. Dentro de un formulario, `pegada` (se queda en su flujo). Sobre unas pestañas
 * de abajo, `sobre` con su alto. La forma vive en `app/estilos/barra-abajo.css`; lo de adentro lo pone la pantalla, con
 * `BarraDeAbajoResumen` y `barra-abajo-acciones` si tiene una cifra y botones.
 */
export function BarraDeAbajo({
  tono = "papel",
  sola = false,
  pegada = false,
  sobre,
  className = "",
  style,
  children,
  ...resto
}: {
  tono?: "papel" | "tinta";
  sola?: boolean;
  pegada?: boolean;
  /** El alto de las pestañas de abajo sobre las que se apoya (`calc(3.5rem + 1px)`). */
  sobre?: string;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  // La isla clara flota sobre la pantalla en el celular: dobla lo de atrás en su canto y conserva su relleno (lleva una cifra y su detalle
  // que se leen). La oscura es ahumada, no de vidrio; y en escritorio la barra va a ras, de borde a borde. ADR-0681.
  const dobla = useVidrioQueDobla<HTMLDivElement>({ desenfoque: 24, solo: CELULAR, asienta: true, activo: tono !== "tinta" });
  return (
    <div
      {...resto}
      ref={dobla}
      className={`barra-abajo ${className}`}
      data-tono={tono === "tinta" ? "tinta" : undefined}
      data-sola={sola || undefined}
      data-pegada={pegada || undefined}
      style={sobre ? ({ ...style, "--sobre": sobre } as CSSProperties) : style}
    >
      {children}
    </div>
  );
}

/** La cifra en serif y, debajo, el detalle en taupe: lo que resume la barra, a la izquierda (la primera en usarla: comparar proveedores). */
export function BarraDeAbajoResumen({ cifra, detalle, className = "" }: { cifra: ReactNode; detalle?: ReactNode; className?: string }) {
  return (
    <div className={`barra-abajo-resumen ${className}`}>
      <div className="barra-abajo-cifra">{cifra}</div>
      {detalle ? <div className="barra-abajo-detalle">{detalle}</div> : null}
    </div>
  );
}
