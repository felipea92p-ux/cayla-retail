"use client";

import { useSyncExternalStore, type ComponentType } from "react";
import { LayoutGrid, PackageX, ShoppingBag, TriangleAlert, Type } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { preferenciaLocal } from "@/lib/preferencia-local";
import { ATAJOS_RAPIDOS, atajoElegido, cuentaDeAtajo, rotuloDeAtajo, type ClaveRapida } from "@/lib/existencias-rapidos";
import type { ClaveUrl, ConteosFiltros, FiltrosElegidos } from "@/lib/existencias-filtros";

/* ====================================================================
   Atajos de filtro de Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`): cinco botones bajo el buscador
   para lo que más se pregunta en el piso. Escriben los mismos filtros que el panel «Filtros» (`lib/existencias-rapidos.ts`).

   Se ven de dos formas, y quien trabaja elige (el gusto es de cada equipo, `preferencia-local.ts`): SOLO ICONOS, con el nombre y la
   cifra al pasar el mouse o enfocar con el teclado, o ICONOS CON TEXTO. De fábrica, solo iconos, como en la maqueta aprobada: la fila
   cabe en una línea, también en el celular. Cada botón lleva su nombre como etiqueta para el lector de pantalla en las dos formas.
   ==================================================================== */

const vistaRapidos = preferenciaLocal<"iconos" | "texto">("cayla.filtros-rapidos", ["iconos", "texto"], "iconos");

type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const ICONO: Record<ClaveRapida, Icono> = {
  todo: LayoutGrid,
  por_colgar: IconoPercha,
  sin_stock_atras: PackageX,
  apartadas: ShoppingBag,
  danadas: TriangleAlert,
};

/** El tono de cada botón encendido: ámbar lo que hay que hacer, pizarra lo informativo (el rojo se reserva a lo vencido, ADR-0169). */
const TONO_ENCENDIDO: Record<ClaveRapida, string> = {
  todo: "border-tinta bg-tinta text-crema",
  por_colgar: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
  sin_stock_atras: "border-pizarra/40 bg-pizarra/10 text-pizarra",
  apartadas: "border-pizarra/40 bg-pizarra/10 text-pizarra",
  danadas: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
};

export function FiltrosRapidos({
  elegidos,
  conteos,
  onCambiar,
}: {
  elegidos: Pick<FiltrosElegidos, "hoy" | "condicion">;
  conteos: Pick<ConteosFiltros, "hoy" | "condicion">;
  onCambiar: (cambios: Partial<Record<ClaveUrl, string | null>>) => void;
}) {
  const vista = useSyncExternalStore(vistaRapidos.suscribir, vistaRapidos.leer, vistaRapidos.leerEnServidor);
  const soloIconos = vista === "iconos";
  const encendido = atajoElegido(elegidos);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Atajos de filtro" className="scroll-cayla flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {ATAJOS_RAPIDOS.map((a) => {
            const Icono = ICONO[a.clave];
            const cuenta = cuentaDeAtajo(a.clave, conteos);
            const puesto = encendido === a.clave;
            const rotulo = rotuloDeAtajo(a, cuenta);
            const boton = (
              <button
                type="button"
                aria-pressed={puesto}
                aria-label={soloIconos ? rotulo : undefined}
                onClick={() => onCambiar(a.cambios)}
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border text-[13px] transition-colors ${
                  soloIconos ? "min-w-[2.75rem] px-2.5" : "px-3"
                } ${puesto ? TONO_ENCENDIDO[a.clave] : "border-tinta/15 bg-papel text-tinta/70 hover:border-tinta/30 hover:text-tinta"}`}
              >
                <Icono aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                {!soloIconos && <span>{a.texto}</span>}
                {cuenta !== null && (
                  <b className={`rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums ${puesto ? "bg-tinta/10" : "bg-sand/70 text-tinta/75"}`}>{cuenta.toLocaleString("es-PE")}</b>
                )}
              </button>
            );
            // Con texto el botón ya se explica solo; solo iconos, el nombre y su frase salen al pasar el mouse o enfocar.
            return soloIconos ? (
              <Tooltip key={a.clave}>
                <TooltipTrigger asChild>{boton}</TooltipTrigger>
                <TooltipContent side="bottom">
                  <b className="font-semibold">{rotulo}</b>
                  <span className="block opacity-80">{a.ayuda}</span>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span key={a.clave} className="contents">
                {boton}
              </span>
            );
          })}
        </div>

        {/* Cómo se ven: solo iconos o con texto. Cada equipo se queda con el que le sirve. */}
        <span role="group" aria-label="Cómo ver los atajos" className="inline-flex shrink-0 overflow-hidden rounded-lg border border-tinta/15 bg-papel">
          {(
            [
              ["iconos", "Solo iconos", LayoutGrid],
              ["texto", "Iconos con texto", Type],
            ] as const
          ).map(([v, nombre, Ico]) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              aria-label={nombre}
              title={nombre}
              onClick={() => vistaRapidos.fijar(v)}
              className="inline-flex h-8 w-8 items-center justify-center text-taupe transition-colors hover:text-tinta aria-pressed:bg-hueso aria-pressed:text-tinta"
            >
              <Ico aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ))}
        </span>
      </div>
    </TooltipProvider>
  );
}
