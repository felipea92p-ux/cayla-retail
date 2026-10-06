"use client";

import { type ComponentType } from "react";
import { Clock, LayoutGrid, Moon, Pause, PackageX, ShoppingBag, TriangleAlert } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { ATAJOS_RAPIDOS, atajoElegido, CLAVES_RECOMENDADAS, cuentaDeAtajo, rotuloDeAtajo, type ClaveRapida } from "@/lib/existencias-rapidos";
import type { ClaveUrl, ConteosFiltros, FiltrosElegidos } from "@/lib/existencias-filtros";

/* ====================================================================
   Atajos de filtro de Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`): siete botones bajo el buscador
   para lo que más se pregunta en el piso. Escriben los mismos filtros que el panel «Filtros» (`lib/existencias-rapidos.ts`).

   Siempre con su nombre a la vista (2026-10-06): el modo «solo iconos» obligaba a pasar el mouse o adivinar qué era cada figura, y en
   una tablet no hay mouse. En el celular la fila se desliza de lado, con el borde derecho desvanecido para avisar que sigue; en la
   computadora, si no caben (bajo ~1366 px), el último baja a otra línea: con mouse, una fila que se desliza esconde botones.

   Con el piso sin cuadrar (`enPausa` > 0), «Por colgar» no cuenta: el motor no manda a colgar nada porque podría ser algo que ya
   cuelga (ADR-0328, decisión 5). En vez de un «0» que parece «todo listo», el botón lleva una pausa, y la explicación completa que
   antes era una franja de texto sobre las tarjetas va en su etiqueta y al pasar el mouse.
   ==================================================================== */

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

export function FiltrosRapidos({
  elegidos,
  conteos,
  onCambiar,
  enPausa = 0,
  avisoPausa = null,
}: {
  elegidos: Pick<FiltrosElegidos, "hoy" | "condicion">;
  conteos: Pick<ConteosFiltros, "hoy" | "condicion">;
  onCambiar: (cambios: Partial<Record<ClaveUrl, string | null>>) => void;
  /** Tallas que esperan el cuadre del piso: «Por colgar» va en pausa. */
  enPausa?: number;
  /** La frase completa de la pausa (`avisoPausaDelPiso`), para la etiqueta y el mouse de «Por colgar». */
  avisoPausa?: string | null;
}) {
  const encendido = atajoElegido(elegidos);

  return (
    <div
      role="group"
      aria-label="Atajos de filtro"
      className="scroll-cayla -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-0.5 max-md:pr-8 max-md:[mask-image:linear-gradient(90deg,#000_calc(100%-2rem),transparent)] md:flex-wrap md:overflow-visible"
    >
      {ATAJOS_RAPIDOS.map((a) => {
        const Icono = ICONO[a.clave];
        // Los «Recomendados» van tras una línea y su rótulo: salen del ritmo y no de lo que hay que hacer con la talla.
        const primeraRecomendada = a.clave === CLAVES_RECOMENDADAS[0];
        const cuenta = cuentaDeAtajo(a.clave, conteos);
        const puesto = encendido === a.clave;
        const pausado = a.clave === "por_colgar" && enPausa > 0;
        const rotulo = pausado ? `${a.texto}: en pausa. ${avisoPausa ?? ""}`.trim() : rotuloDeAtajo(a, cuenta);
        return (
          <span key={a.clave} className="contents">
            {primeraRecomendada && (
              <span className="flex shrink-0 items-center gap-2" aria-hidden>
                <span className="mx-1 h-5 w-px bg-tinta/15" />
                {/* El rótulo solo donde sobra ancho: debajo, la línea ya separa y cada botón dice su nombre. */}
                <span className="label-cayla hidden text-[10px] text-taupe min-[1400px]:inline">Recomendados</span>
              </span>
            )}
            <button
              type="button"
              aria-pressed={puesto}
              aria-label={rotulo}
              title={pausado ? (avisoPausa ?? undefined) : a.ayuda}
              onClick={() => onCambiar(a.cambios)}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full border pl-2.5 pr-2 text-[13px] transition-colors ${
                puesto ? TONO_ENCENDIDO[a.clave] : "border-tinta/15 bg-papel text-tinta/75 hover:border-tinta/30 hover:text-tinta"
              }`}
            >
              <Icono aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              <span>{a.texto}</span>
              {pausado ? (
                <b aria-hidden className={`ml-0.5 grid h-[18px] w-[18px] place-items-center rounded-full ${puesto ? "bg-tinta/10" : "bg-pizarra/10 text-pizarra"}`}>
                  <Pause className="h-2.5 w-2.5" strokeWidth={3} />
                </b>
              ) : (
                cuenta !== null && (
                  <b aria-hidden className={`ml-0.5 rounded-full px-[5px] text-[11px] font-semibold leading-[18px] tabular-nums ${puesto ? "bg-tinta/10" : "bg-sand/70 text-tinta/75"}`}>
                    {cuenta.toLocaleString("es-PE")}
                  </b>
                )
              )}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** El orden de las tarjetas, del que la maqueta muestra dos: «Prioridad» (lo que falta en el piso primero, la lista del día del motor) y «A–Z».
 *  Los otros órdenes siguen en el panel «Filtros». Mismo estado que ese combo (`useFiltrosExistencias`). */
export function OrdenCorto({ valor, onValor }: { valor: string; onValor: (v: string) => void }) {
  return (
    <span role="group" aria-label="Orden" className="inline-flex shrink-0 overflow-hidden rounded-lg border border-tinta/15 bg-papel text-[13px]">
      {(
        [
          ["relevancia", "Prioridad", "Lo que falta en el piso y más se vende, primero"],
          ["nombre", "A–Z", "Por nombre"],
        ] as const
      ).map(([v, texto, ayuda]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          title={ayuda}
          onClick={() => onValor(v)}
          className="h-9 px-3 text-taupe transition-colors hover:text-tinta aria-pressed:bg-hueso aria-pressed:font-semibold aria-pressed:text-tinta focus-visible:-outline-offset-2"
        >
          {texto}
        </button>
      ))}
    </span>
  );
}
