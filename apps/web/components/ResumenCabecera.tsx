"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ResumenActualizado } from "@/components/ResumenActualizado";
import type { CambiosUrl } from "@/components/useResumenUrl";
import type { ModoResumen } from "@/lib/resumen-comparacion";
import { periodosParaSembrar } from "@/lib/resumen-periodos-guardados";

// La fila de arriba del Análisis de inventario: los dos modos —Desempeño y Comparar períodos— a la
// izquierda, y la marca discreta «Actualizado» a la derecha.
// El modo vive en la URL (`?modo=comparar`) como todo lo demás: se comparte, se recarga y
// «atrás» funciona.

/** Pestañas subrayadas (guía oficial, 2026-09-22). Sirve al modo de la
 *  pantalla (Comparar ya no tiene «Vista general / Detalle por producto» desde el rediseño del 2026-09-22). */
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
    // Guía oficial (ADR-0169): pestañas subrayadas sobre la línea de sand; la elegida en tinta con el hilo rojo.
    // Sin barra de scroll visible (2026-09-26): `overflow-x-auto` vuelve `auto` también el eje vertical, y el `-mb-px` de
    // cada pestaña lo desborda 1 px; Safari dibujaba entonces una barra bajo las pestañas y otra al costado que tapaba el
    // final de «Comparar períodos». Si no caben a lo ancho, se siguen desplazando con el dedo o la rueda.
    <div role="tablist" aria-label={etiqueta} className="flex max-w-full gap-1 overflow-x-auto border-b border-sand [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
  claveGuardado,
  children,
}: {
  modo: ModoResumen;
  ahoraIso: string;
  actualizar: (cambios: CambiosUrl) => void;
  /** Dónde se recuerdan A y B (`clavePeriodosElegidos`): por sede y por persona. */
  claveGuardado: string;
  /** Lo que dice el popover de «Actualizado». */
  children: ReactNode;
}) {
  const params = useSearchParams();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <Pestanas
        etiqueta="Modo del análisis"
        valor={modo}
        opciones={MODOS}
        // Cada modo tiene sus propios órdenes y filtros de tabla: al cambiar se parte de los iniciales. Al ENTRAR a
        // Comparar se le suman los períodos que la persona dejó elegidos (2026-09-29), en este mismo clic: una sola
        // navegación, sin un primer pintado con los de por defecto. Si la URL ya trae fechas de Comparar, no se toca.
        onValor={(m) =>
          actualizar(
            m === "comparar"
              ? { modo: "comparar", orden: null, st: null, ...periodosParaSembrar(claveGuardado, (k) => params.has(k)) }
              : { modo: null, vista: null, senal: null, orden: null, cambio: null },
          )
        }
      />
      <ResumenActualizado ahoraIso={ahoraIso}>{children}</ResumenActualizado>
    </div>
  );
}
