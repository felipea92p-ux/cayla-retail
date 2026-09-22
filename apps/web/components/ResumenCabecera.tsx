"use client";

import type { ReactNode } from "react";
import { ResumenActualizado } from "@/components/ResumenActualizado";
import type { CambiosUrl } from "@/components/useResumenUrl";
import type { ModoResumen } from "@/lib/resumen-comparacion";

// La fila de arriba del Análisis de inventario: los dos modos —Desempeño y Comparar períodos— a la
// izquierda, y la marca discreta «Actualizado» a la derecha.
// El modo vive en la URL (`?modo=comparar`) como todo lo demás: se comparte, se recarga y
// «atrás» funciona.

/** Pestañas subrayadas (guía oficial, 2026-09-22). Sirve al modo de la
 *  pantalla y a «Vista general / Detalle por producto». */
export function Pestanas<T extends string>({
  etiqueta,
  valor,
  opciones,
  onValor,
}: {
  etiqueta: string;
  valor: T;
  opciones: readonly { valor: T; texto: string }[];
  onValor: (v: T) => void;
}) {
  return (
    // Guía oficial (ADR-0167): pestañas subrayadas sobre la línea de sand; la elegida en tinta con el hilo rojo.
    <div role="tablist" aria-label={etiqueta} className="flex max-w-full gap-1 overflow-x-auto border-b border-sand">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={o.valor === valor}
          onClick={() => o.valor !== valor && onValor(o.valor)}
          className={`-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3.5 pb-2.5 pt-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo/60 ${
            o.valor === valor ? "border-rojo text-tinta" : "border-transparent text-taupe hover:text-tinta"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

const MODOS: readonly { valor: ModoResumen; texto: string }[] = [
  { valor: "desempeno", texto: "Desempeño" },
  { valor: "comparar", texto: "Comparar períodos" },
];

export function ResumenCabecera({
  modo,
  ahoraIso,
  actualizar,
  children,
}: {
  modo: ModoResumen;
  ahoraIso: string;
  actualizar: (cambios: CambiosUrl) => void;
  /** Lo que dice el popover de «Actualizado». */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <Pestanas
        etiqueta="Modo del análisis"
        valor={modo}
        opciones={MODOS}
        // Cada modo tiene sus propios órdenes y filtros de tabla: al cambiar se parte de los iniciales.
        onValor={(m) => actualizar(m === "comparar" ? { modo: "comparar", orden: null } : { modo: null, vista: null, senal: null, orden: null })}
      />
      <ResumenActualizado ahoraIso={ahoraIso}>{children}</ResumenActualizado>
    </div>
  );
}
