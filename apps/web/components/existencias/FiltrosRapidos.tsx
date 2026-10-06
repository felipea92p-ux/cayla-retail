"use client";

import { useSyncExternalStore, type ComponentType } from "react";
import { Clock, LayoutGrid, Moon, PackageX, ShoppingBag, TriangleAlert, Type } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { preferenciaLocal } from "@/lib/preferencia-local";
import { ATAJOS_RAPIDOS, atajoElegido, CLAVES_RECOMENDADAS, cuentaDeAtajo, rotuloDeAtajo, type ClaveRapida } from "@/lib/existencias-rapidos";
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
  se_acaban: Clock,
  sin_ventas: Moon,
};

/** El tono de cada botón encendido: ámbar lo que hay que hacer, pizarra lo informativo (el rojo se reserva a lo vencido, ADR-0169). */
const TONO_ENCENDIDO: Record<ClaveRapida, string> = {
  todo: "border-tinta bg-tinta text-crema",
  por_colgar: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
  sin_stock_atras: "border-pizarra/40 bg-pizarra/10 text-pizarra",
  apartadas: "border-pizarra/40 bg-pizarra/10 text-pizarra",
  danadas: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
  se_acaban: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
  sin_ventas: "border-pizarra/40 bg-pizarra/10 text-pizarra",
};

/** El orden de las tarjetas, del que la maqueta muestra dos: «Prioridad» (lo que falta en el piso primero, la lista del día del motor) y «A–Z».
 *  Los otros órdenes siguen en «Ordenar por», debajo. Mismo estado que ese combo (`useFiltrosExistencias`). */
type OrdenCorto = { valor: string; onValor: (v: string) => void };

export function FiltrosRapidos({
  elegidos,
  conteos,
  onCambiar,
  orden = null,
}: {
  elegidos: Pick<FiltrosElegidos, "hoy" | "condicion">;
  conteos: Pick<ConteosFiltros, "hoy" | "condicion">;
  onCambiar: (cambios: Partial<Record<ClaveUrl, string | null>>) => void;
  /** Solo en las tarjetas: la tabla conserva su orden. */
  orden?: OrdenCorto | null;
}) {
  const vista = useSyncExternalStore(vistaRapidos.suscribir, vistaRapidos.leer, vistaRapidos.leerEnServidor);
  const soloIconos = vista === "iconos";
  const encendido = atajoElegido(elegidos);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Atajos de filtro" className="scroll-cayla -mx-1 -my-0.5 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-1">
          {ATAJOS_RAPIDOS.map((a) => {
            const Icono = ICONO[a.clave];
            // Los «Recomendados» van tras una línea y, con texto, su rótulo: salen del ritmo y no de lo que hay que hacer con la talla.
            const primeraRecomendada = a.clave === CLAVES_RECOMENDADAS[0];
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
            const separador = primeraRecomendada && (
              <span key={`sep-${a.clave}`} className="flex shrink-0 items-center gap-2" aria-hidden>
                <span className="mx-1 h-5 w-px bg-tinta/15" />
                {!soloIconos && <span className="label-cayla text-[10px] text-taupe">Recomendados</span>}
              </span>
            );
            return soloIconos ? (
              <span key={a.clave} className="contents">
                {separador}
              <Tooltip>
                <TooltipTrigger asChild>{boton}</TooltipTrigger>
                <TooltipContent side="bottom">
                  <b className="font-semibold">{rotulo}</b>
                  <span className="block opacity-80">{a.ayuda}</span>
                </TooltipContent>
              </Tooltip>
              </span>
            ) : (
              <span key={a.clave} className="contents">
                {separador}
                {boton}
              </span>
            );
          })}
        </div>

        {/* Cómo se ven: solo iconos o con texto. Cada equipo se queda con el que le sirve. Es un modo de vista (los mismos atajos
            de otra forma): el segmento de modo del sistema, con el icono y siempre su palabra (ADR-0354). */}
        <SegmentoDeslizante
          forma="modo"
          etiqueta="Cómo ver los atajos"
          valor={vista}
          onCambio={(v) => vistaRapidos.fijar(v as "iconos" | "texto")}
          opciones={[
            { clave: "iconos", icono: <LayoutGrid aria-hidden strokeWidth={1.75} />, etiqueta: "Solo iconos" },
            { clave: "texto", icono: <Type aria-hidden strokeWidth={1.75} />, etiqueta: "Iconos con texto" },
          ]}
        />

        {/* El orden de la lista: el mismo segmento de modo. */}
        {orden && (
          <SegmentoDeslizante
            forma="modo"
            etiqueta="Orden"
            valor={orden.valor}
            onCambio={(v) => orden.onValor(v as typeof orden.valor)}
            opciones={[
              { clave: "relevancia", etiqueta: <span title="Lo que falta en el piso y más se vende, primero">Prioridad</span> },
              { clave: "nombre", etiqueta: <span title="Por nombre">A–Z</span> },
            ]}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
